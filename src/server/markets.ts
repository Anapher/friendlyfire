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
  description: string;
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

export async function createMarket(prisma: PrismaClient, input: CreateMarketInput) {
  return prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUniqueOrThrow({ where: { id: input.actorUserId } });
    if (actor.status !== "ACTIVE") {
      throw domainError("INACTIVE_USER", "Only active users can create markets");
    }

    if (input.closeTime.getTime() <= Date.now()) {
      throw domainError("INVALID_CLOSE_TIME", "Market close time must be in the future");
    }

    return tx.market.create({
      data: {
        creatorId: input.actorUserId,
        question: input.question,
        description: input.description,
        resolutionCriteria: input.resolutionCriteria,
        closeTime: input.closeTime,
        status: "OPEN",
      },
    });
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

    const priorSettlementEntries = await tx.ledgerEntry.findMany({
      where: {
        marketId: input.marketId,
        type: { in: ["MARKET_PAYOUT", "MARKET_SETTLEMENT_COLLATERAL"] },
      },
      orderBy: { createdAt: "asc" },
    });
    if (priorSettlementEntries.length === 0) {
      throw domainError("MISSING_SETTLEMENT_LEDGER", "Resolved market has no settlement ledger");
    }

    const operationId = randomUUID();
    for (const entry of priorSettlementEntries) {
      if (entry.amountCents === 0) {
        continue;
      }

      if (entry.userId && entry.amountCents !== 0) {
        await tx.user.update({
          where: { id: entry.userId },
          data: { availableCents: { decrement: entry.amountCents } },
        });
      }

      await tx.ledgerEntry.create({
        data: {
          userId: entry.userId,
          marketId: input.marketId,
          type: "MARKET_PAYOUT_REVERSAL",
          amountCents: -entry.amountCents,
          metadataJson: JSON.stringify({
            operationId,
            reversedLedgerEntryId: entry.id,
            actorUserId: input.actorUserId,
            note: input.note,
          }),
        },
      });
    }

    const restoredCollateralCents = priorSettlementEntries.reduce(
      (total, entry) =>
        entry.type === "MARKET_SETTLEMENT_COLLATERAL" ? total - entry.amountCents : total,
      0,
    );
    await tx.market.update({
      where: { id: input.marketId },
      data: {
        collateralCents: { increment: restoredCollateralCents },
      },
    });

    const snapshots = positionSnapshotsFromSettlementLedger(priorSettlementEntries);
    const totalPayoutCents = await settlePositionSnapshots(tx, {
      marketId: input.marketId,
      resolution: input.resolution,
      operationId,
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
