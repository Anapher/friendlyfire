import type { Market, Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { domainError } from "@/domain/errors";
import { payoutCentsPerShare } from "@/domain/settlement";
import type { Outcome, Resolution } from "@/domain/types";
import { audit } from "./audit";
import { cancelRestingOrders } from "./orders";

type CreateMarketInput = {
  actorUserId: string;
  question: string;
  resolutionCriteria: string;
  closeTime: Date;
};

type BlacklistInput = {
  actorUserId: string;
  marketId: string;
  userId: string;
  note: string;
};

type ResolveMarketInput = {
  actorUserId: string;
  marketId: string;
  resolution: Resolution;
  note: string;
};

type CorrectMarketResolutionInput = ResolveMarketInput;

type MarketPositionSnapshot = {
  userId: string;
  outcome: Outcome;
  quantity: number;
};

type MarketsPrisma = Prisma.TransactionClient;

const ORIGINAL_SETTLEMENT_LEDGER_TYPES = ["MARKET_PAYOUT", "MARKET_SETTLEMENT_COLLATERAL"];
const CORRECTION_SETTLEMENT_LEDGER_TYPES = [
  "MARKET_CORRECTION_PAYOUT",
  "MARKET_CORRECTION_COLLATERAL",
];
const ALL_SETTLEMENT_COLLATERAL_LEDGER_TYPES = [
  "MARKET_SETTLEMENT_COLLATERAL",
  "MARKET_CORRECTION_COLLATERAL",
];

export async function createMarket(prisma: PrismaClient, input: CreateMarketInput) {
  return prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUniqueOrThrow({ where: { id: input.actorUserId } });
    if (actor.status !== "ACTIVE") {
      throw domainError("INACTIVE_USER", "Only active users can create markets");
    }

    if (input.closeTime.getTime() <= Date.now()) {
      throw domainError("INVALID_CLOSE_TIME", "Market close time must be in the future");
    }

    const market = await tx.market.create({
      data: {
        creatorId: input.actorUserId,
        question: input.question,
        resolutionCriteria: input.resolutionCriteria,
        closeTime: input.closeTime,
        status: "OPEN",
      },
    });

    await audit(tx, {
      actorUserId: input.actorUserId,
      action: "MARKET_CREATED",
      entityType: "Market",
      entityId: market.id,
      metadata: {
        marketId: market.id,
        question: input.question,
        closeTime: input.closeTime.toISOString(),
      },
    });

    return market;
  });
}

export async function addUserToMarketBlacklist(prisma: PrismaClient, input: BlacklistInput) {
  return prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUniqueOrThrow({ where: { id: input.actorUserId } });
    if (actor.status !== "ACTIVE") {
      throw domainError("INACTIVE_USER", "Only active users can blacklist market users");
    }

    await tx.market.findUniqueOrThrow({ where: { id: input.marketId } });
    await tx.user.findUniqueOrThrow({ where: { id: input.userId } });

    const blacklistEntry = await tx.marketBlacklist.create({
      data: {
        marketId: input.marketId,
        userId: input.userId,
        createdById: input.actorUserId,
        note: input.note,
      },
    });
    const cancelledOrderIds = await cancelRestingOrders(tx, {
      marketId: input.marketId,
      userId: input.userId,
    });

    await audit(tx, {
      actorUserId: input.actorUserId,
      action: "MARKET_USER_BLACKLISTED",
      entityType: "MarketBlacklist",
      entityId: input.marketId,
      metadata: {
        marketId: input.marketId,
        userId: input.userId,
        note: input.note,
        cancelledOrderIds,
      },
    });

    return blacklistEntry;
  });
}

export async function closeExpiredMarkets(prisma: PrismaClient, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const expiredMarkets = await tx.market.findMany({
      where: {
        status: "OPEN",
        closeTime: { lte: now },
      },
      orderBy: { closeTime: "asc" },
    });
    const closedMarkets: Market[] = [];

    for (const market of expiredMarkets) {
      const cancelledOrderIds = await cancelRestingOrders(tx, { marketId: market.id });
      const closedMarket = await tx.market.update({
        where: { id: market.id },
        data: { status: "CLOSED" },
      });

      await audit(tx, {
        action: "MARKET_CLOSED",
        entityType: "Market",
        entityId: market.id,
        metadata: {
          marketId: market.id,
          closedAt: now.toISOString(),
          closeTime: market.closeTime.toISOString(),
          cancelledOrderIds,
        },
      });

      closedMarkets.push(closedMarket);
    }

    return closedMarkets;
  });
}

export async function resolveMarket(prisma: PrismaClient, input: ResolveMarketInput) {
  return prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUniqueOrThrow({ where: { id: input.actorUserId } });
    if (actor.status !== "ACTIVE") {
      throw domainError("INACTIVE_USER", "Only active users can resolve markets");
    }

    const market = await tx.market.findUniqueOrThrow({ where: { id: input.marketId } });
    if (market.status !== "OPEN" && market.status !== "CLOSED") {
      throw domainError("MARKET_NOT_RESOLVABLE", "Only open or closed markets can be resolved");
    }

    const resolvedAt = new Date();
    const cancelledOrderIds = await cancelRestingOrders(tx, { marketId: input.marketId });
    const operationId = randomUUID();
    const positions = await tx.position.findMany({
      where: { marketId: input.marketId },
      orderBy: [{ userId: "asc" }, { outcome: "asc" }],
    });
    const snapshots = positions.map((position) => ({
      userId: position.userId,
      outcome: position.outcome as Outcome,
      quantity: position.availableQuantity + position.lockedQuantity,
    }));
    const totalPayoutCents = await settlePositionSnapshots(tx, {
      marketId: input.marketId,
      resolution: input.resolution,
      operationId,
      settlementSequence: 1,
      snapshots,
      payoutLedgerType: "MARKET_PAYOUT",
      collateralLedgerType: "MARKET_SETTLEMENT_COLLATERAL",
      includeZeroPayoutEntries: true,
    });

    for (const position of positions) {
      await tx.position.update({
        where: { id: position.id },
        data: {
          availableQuantity: 0,
          lockedQuantity: 0,
        },
      });
    }

    const resolved = await tx.market.update({
      where: { id: input.marketId },
      data: {
        status: "RESOLVED",
        resolution: input.resolution,
        resolutionNote: input.note,
        resolvedById: input.actorUserId,
        resolvedAt,
        collateralCents: { decrement: totalPayoutCents },
      },
    });

    await audit(tx, {
      actorUserId: input.actorUserId,
      action: "MARKET_RESOLVED",
      entityType: "Market",
      entityId: input.marketId,
      metadata: {
        marketId: input.marketId,
        resolution: input.resolution,
        note: input.note,
        resolvedAt: resolvedAt.toISOString(),
        cancelledOrderIds,
        operationId,
        settlementSequence: 1,
        totalPayoutCents,
      },
    });

    return resolved;
  });
}

export async function correctMarketResolution(
  prisma: PrismaClient,
  input: CorrectMarketResolutionInput,
) {
  return prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUniqueOrThrow({ where: { id: input.actorUserId } });
    if (actor.role !== "ADMIN") {
      throw domainError("UNAUTHORIZED_ADMIN_ACTION", "Only admins can correct market resolutions");
    }

    const market = await tx.market.findUniqueOrThrow({ where: { id: input.marketId } });
    if (market.status !== "RESOLVED") {
      throw domainError("MARKET_NOT_CORRECTABLE", "Only resolved markets can be corrected");
    }

    const originalSettlementEntries = await tx.ledgerEntry.findMany({
      where: {
        marketId: input.marketId,
        type: { in: ORIGINAL_SETTLEMENT_LEDGER_TYPES },
      },
      orderBy: { createdAt: "asc" },
    });
    if (originalSettlementEntries.length === 0) {
      throw domainError("MISSING_SETTLEMENT_LEDGER", "Resolved market has no settlement ledger");
    }
    const currentSettlement = await currentSettlementOperation(tx, input.marketId);

    const operationId = randomUUID();
    for (const entry of currentSettlement.entries) {
      if (entry.amountCents === 0) {
        continue;
      }

      if (entry.userId && entry.amountCents > 0) {
        const reversed = await tx.user.updateMany({
          where: {
            id: entry.userId,
            availableCents: { gte: entry.amountCents },
          },
          data: {
            availableCents: { decrement: entry.amountCents },
          },
        });
        if (reversed.count !== 1) {
          throw domainError(
            "INSUFFICIENT_SETTLEMENT_CLAWBACK",
            "Insufficient available balance to reverse settlement payout",
          );
        }
      }

      await tx.ledgerEntry.create({
        data: {
          userId: entry.userId,
          marketId: input.marketId,
          type: "MARKET_PAYOUT_REVERSAL",
          amountCents: -entry.amountCents,
          metadataJson: JSON.stringify({
            operationId,
            settlementSequence: currentSettlement.settlementSequence + 1,
            reversedSettlementSequence: currentSettlement.settlementSequence,
            reversedLedgerEntryId: entry.id,
            actorUserId: input.actorUserId,
            note: input.note,
          }),
        },
      });
    }

    const restoredCollateralCents = currentSettlement.entries.reduce(
      (total, entry) =>
        ALL_SETTLEMENT_COLLATERAL_LEDGER_TYPES.includes(entry.type)
          ? total - entry.amountCents
          : total,
      0,
    );
    await tx.market.update({
      where: { id: input.marketId },
      data: {
        collateralCents: { increment: restoredCollateralCents },
      },
    });

    const snapshots = positionSnapshotsFromSettlementLedger(originalSettlementEntries);
    const totalPayoutCents = await settlePositionSnapshots(tx, {
      marketId: input.marketId,
      resolution: input.resolution,
      operationId,
      settlementSequence: currentSettlement.settlementSequence + 1,
      snapshots,
      payoutLedgerType: "MARKET_CORRECTION_PAYOUT",
      collateralLedgerType: "MARKET_CORRECTION_COLLATERAL",
      includeZeroPayoutEntries: false,
    });
    const resolvedAt = new Date();
    const corrected = await tx.market.update({
      where: { id: input.marketId },
      data: {
        status: "RESOLVED",
        resolution: input.resolution,
        resolutionNote: input.note,
        resolvedById: input.actorUserId,
        resolvedAt,
        collateralCents: { decrement: totalPayoutCents },
      },
    });

    await audit(tx, {
      actorUserId: input.actorUserId,
      action: "MARKET_RESOLUTION_CORRECTED",
      entityType: "Market",
      entityId: input.marketId,
      metadata: {
        marketId: input.marketId,
        previousResolution: market.resolution,
        resolution: input.resolution,
        note: input.note,
        operationId,
        settlementSequence: currentSettlement.settlementSequence + 1,
        totalPayoutCents,
      },
    });

    await audit(tx, {
      actorUserId: input.actorUserId,
      action: "MARKET_RESOLVED",
      entityType: "Market",
      entityId: input.marketId,
      metadata: {
        marketId: input.marketId,
        previousResolution: market.resolution,
        resolution: input.resolution,
        note: input.note,
        resolvedAt: resolvedAt.toISOString(),
        operationId,
        settlementSequence: currentSettlement.settlementSequence + 1,
        totalPayoutCents,
        correction: true,
      },
    });

    return corrected;
  });
}

async function settlePositionSnapshots(
  prisma: MarketsPrisma,
  input: {
    marketId: string;
    resolution: Resolution;
    operationId: string;
    settlementSequence: number;
    snapshots: MarketPositionSnapshot[];
    payoutLedgerType: string;
    collateralLedgerType: string;
    includeZeroPayoutEntries: boolean;
  },
) {
  let totalPayoutCents = 0;

  for (const snapshot of input.snapshots) {
    const payoutCents =
      snapshot.quantity * payoutCentsPerShare(input.resolution, snapshot.outcome);
    totalPayoutCents += payoutCents;

    if (payoutCents > 0) {
      await prisma.user.update({
        where: { id: snapshot.userId },
        data: { availableCents: { increment: payoutCents } },
      });
    }

    if (payoutCents > 0 || input.includeZeroPayoutEntries) {
      await prisma.ledgerEntry.create({
        data: {
          userId: snapshot.userId,
          marketId: input.marketId,
          type: input.payoutLedgerType,
          amountCents: payoutCents,
          metadataJson: JSON.stringify({
            operationId: input.operationId,
            settlementSequence: input.settlementSequence,
            resolution: input.resolution,
            outcome: snapshot.outcome,
            quantity: snapshot.quantity,
            payoutCentsPerShare: payoutCentsPerShare(input.resolution, snapshot.outcome),
          }),
        },
      });
    }
  }

  await prisma.ledgerEntry.create({
    data: {
      marketId: input.marketId,
      type: input.collateralLedgerType,
      amountCents: -totalPayoutCents,
      metadataJson: JSON.stringify({
        operationId: input.operationId,
        settlementSequence: input.settlementSequence,
        resolution: input.resolution,
        totalPayoutCents,
      }),
    },
  });

  return totalPayoutCents;
}

function positionSnapshotsFromSettlementLedger(
  entries: { userId: string | null; metadataJson: string }[],
) {
  const snapshots: MarketPositionSnapshot[] = [];

  for (const entry of entries) {
    const metadata = JSON.parse(entry.metadataJson) as {
      userId?: string;
      outcome?: Outcome;
      quantity?: number;
    };
    if (metadata.outcome && typeof metadata.quantity === "number") {
      if (entry.userId) {
        snapshots.push({
          userId: entry.userId,
          outcome: metadata.outcome,
          quantity: metadata.quantity,
        });
      }
    }
  }

  return snapshots;
}

async function currentSettlementOperation(prisma: MarketsPrisma, marketId: string) {
  const collateralEntries = await prisma.ledgerEntry.findMany({
    where: {
      marketId,
      type: { in: ALL_SETTLEMENT_COLLATERAL_LEDGER_TYPES },
    },
  });
  if (collateralEntries.length === 0) {
    throw domainError("MISSING_SETTLEMENT_LEDGER", "Resolved market has no settlement ledger");
  }

  const latest = collateralEntries.reduce<{
    entry: (typeof collateralEntries)[number];
    operationId?: string;
    settlementSequence: number;
  } | null>((selected, entry) => {
    const metadata = JSON.parse(entry.metadataJson) as {
      operationId?: string;
      settlementSequence?: number;
    };
    const settlementSequence =
      typeof metadata.settlementSequence === "number" ? metadata.settlementSequence : 1;
    if (!selected || settlementSequence > selected.settlementSequence) {
      return { entry, operationId: metadata.operationId, settlementSequence };
    }

    return selected;
  }, null);
  if (!latest) {
    throw domainError("MISSING_SETTLEMENT_LEDGER", "Resolved market has no settlement ledger");
  }

  const metadata = { operationId: latest.operationId };
  if (!metadata.operationId) {
    throw domainError("MISSING_SETTLEMENT_OPERATION", "Settlement ledger is missing operation id");
  }

  const operationLedgerTypes =
    latest.entry.type === "MARKET_SETTLEMENT_COLLATERAL"
      ? ORIGINAL_SETTLEMENT_LEDGER_TYPES
      : CORRECTION_SETTLEMENT_LEDGER_TYPES;

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      marketId,
      type: { in: operationLedgerTypes },
      metadataJson: { contains: metadata.operationId },
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    entries,
    settlementSequence: latest.settlementSequence,
  };
}
