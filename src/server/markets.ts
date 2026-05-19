import type { Market, Prisma, PrismaClient } from "@prisma/client";
import { domainError } from "@/domain/errors";
import { audit } from "./audit";

type MarketPrisma = PrismaClient | Prisma.TransactionClient;

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
  resolution: "YES" | "NO" | "CANCELLED";
  note: string;
};

const CANCELLABLE_ORDER_STATUSES = ["OPEN", "PARTIALLY_FILLED"];

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
    const resolved = await tx.market.update({
      where: { id: input.marketId },
      data: {
        status: "RESOLVED",
        resolution: input.resolution,
        resolutionNote: input.note,
        resolvedById: input.actorUserId,
        resolvedAt,
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
      },
    });

    return resolved;
  });
}

async function cancelRestingOrders(
  prisma: MarketPrisma,
  input: {
    marketId: string;
    userId?: string;
  },
) {
  const orders = await prisma.order.findMany({
    where: {
      marketId: input.marketId,
      userId: input.userId,
      status: { in: CANCELLABLE_ORDER_STATUSES },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const order of orders) {
    if (order.lockedCents > 0) {
      await prisma.user.update({
        where: { id: order.userId },
        data: {
          availableCents: { increment: order.lockedCents },
          lockedCents: { decrement: order.lockedCents },
        },
      });
    }

    if (order.lockedQuantity > 0) {
      await prisma.position.update({
        where: {
          userId_marketId_outcome: {
            userId: order.userId,
            marketId: order.marketId,
            outcome: order.outcome,
          },
        },
        data: {
          availableQuantity: { increment: order.lockedQuantity },
          lockedQuantity: { decrement: order.lockedQuantity },
        },
      });
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        lockedCents: 0,
        lockedQuantity: 0,
      },
    });
  }

  return orders.map((order) => order.id);
}
