import type { Order, Prisma, PrismaClient } from "@prisma/client";
import { domainError } from "@/domain/errors";
import { assertCentPrice, assertPositiveQuantity } from "@/domain/money";
import { matchIncomingOrder, type BookOrder, type OrderFill } from "@/domain/orderBook";
import type { OrderAction, Outcome } from "@/domain/types";
import { audit } from "./audit";

type OrdersPrisma = PrismaClient | Prisma.TransactionClient;

export type PlaceLimitOrderInput = {
  userId: string;
  marketId: string;
  outcome: Outcome;
  action: OrderAction;
  limitPriceCents: number;
  quantity: number;
};

export type CancelOrderInput = {
  actorUserId: string;
  orderId: string;
};

const CANCELLABLE_ORDER_STATUSES = ["OPEN", "PARTIALLY_FILLED"];

export async function placeLimitOrder(prisma: PrismaClient, input: PlaceLimitOrderInput) {
  return prisma.$transaction(async (tx) => {
    const market = await tx.market.findUniqueOrThrow({ where: { id: input.marketId } });
    if (market.status !== "OPEN") {
      throw domainError("MARKET_NOT_OPEN", "Only open markets can accept orders");
    }

    const actor = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    if (actor.status !== "ACTIVE") {
      throw domainError("INACTIVE_USER", "Only active users can place orders");
    }

    const blacklistEntry = await tx.marketBlacklist.findUnique({
      where: {
        marketId_userId: {
          marketId: input.marketId,
          userId: input.userId,
        },
      },
    });
    if (blacklistEntry) {
      throw domainError(
        "MARKET_USER_BLACKLISTED",
        "Blacklisted users cannot place orders on this market",
      );
    }

    const limitPriceCents = assertCentPrice(input.limitPriceCents);
    const quantity = assertPositiveQuantity(input.quantity);

    const order =
      input.action === "BUY"
        ? await lockCashAndCreateOrder(tx, input, limitPriceCents, quantity)
        : await lockSharesAndCreateOrder(tx, input, limitPriceCents, quantity);

    await audit(tx, {
      actorUserId: input.userId,
      action: "ORDER_PLACED",
      entityType: "Order",
      entityId: order.id,
      metadata: {
        orderId: order.id,
        marketId: input.marketId,
        outcome: input.outcome,
        action: input.action,
        limitPriceCents,
        quantity,
      },
    });

    const restingOrders = await tx.order.findMany({
      where: {
        marketId: input.marketId,
        id: { not: order.id },
        status: { in: CANCELLABLE_ORDER_STATUSES },
        remainingQuantity: { gt: 0 },
      },
    });
    const match = matchIncomingOrder(toBookOrder(order), restingOrders.map(toBookOrder));

    for (const fill of match.fills) {
      await persistFill(tx, fill);
    }

    return tx.order.findUniqueOrThrow({ where: { id: order.id } });
  });
}

export async function cancelOrder(prisma: PrismaClient, input: CancelOrderInput) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: input.orderId } });
    if (order.userId !== input.actorUserId) {
      throw domainError("UNAUTHORIZED_ORDER_CANCEL", "Only the order owner can cancel an order");
    }

    if (!CANCELLABLE_ORDER_STATUSES.includes(order.status)) {
      throw domainError("ORDER_NOT_CANCELLABLE", "Only open orders can be cancelled");
    }

    await releaseOrderLocks(tx, order);
    const cancelled = await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        lockedCents: 0,
        lockedQuantity: 0,
      },
    });

    await audit(tx, {
      actorUserId: input.actorUserId,
      action: "ORDER_CANCELLED",
      entityType: "Order",
      entityId: order.id,
      metadata: {
        orderId: order.id,
        marketId: order.marketId,
        releasedCents: order.lockedCents,
        releasedQuantity: order.lockedQuantity,
      },
    });

    return cancelled;
  });
}

export async function cancelRestingOrders(
  prisma: OrdersPrisma,
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
    await releaseOrderLocks(prisma, order);
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

async function lockCashAndCreateOrder(
  prisma: Prisma.TransactionClient,
  input: PlaceLimitOrderInput,
  limitPriceCents: number,
  quantity: number,
) {
  const lockedCents = limitPriceCents * quantity;
  const locked = await prisma.user.updateMany({
    where: {
      id: input.userId,
      availableCents: { gte: lockedCents },
    },
    data: {
      availableCents: { decrement: lockedCents },
      lockedCents: { increment: lockedCents },
    },
  });

  if (locked.count !== 1) {
    throw domainError("INSUFFICIENT_BALANCE", "Insufficient cash available");
  }

  return prisma.order.create({
    data: {
      userId: input.userId,
      marketId: input.marketId,
      outcome: input.outcome,
      action: input.action,
      limitPriceCents,
      originalQuantity: quantity,
      remainingQuantity: quantity,
      lockedCents,
      status: "OPEN",
    },
  });
}

async function lockSharesAndCreateOrder(
  prisma: Prisma.TransactionClient,
  input: PlaceLimitOrderInput,
  limitPriceCents: number,
  quantity: number,
) {
  const locked = await prisma.position.updateMany({
    where: {
      userId: input.userId,
      marketId: input.marketId,
      outcome: input.outcome,
      availableQuantity: { gte: quantity },
    },
    data: {
      availableQuantity: { decrement: quantity },
      lockedQuantity: { increment: quantity },
    },
  });

  if (locked.count !== 1) {
    throw domainError("INSUFFICIENT_SHARES", "Insufficient shares available");
  }

  return prisma.order.create({
    data: {
      userId: input.userId,
      marketId: input.marketId,
      outcome: input.outcome,
      action: input.action,
      limitPriceCents,
      originalQuantity: quantity,
      remainingQuantity: quantity,
      lockedQuantity: quantity,
      status: "OPEN",
    },
  });
}

async function persistFill(prisma: Prisma.TransactionClient, fill: OrderFill) {
  if (fill.kind === "PRIMARY") {
    await persistPrimaryFill(prisma, fill);
  } else {
    await persistSecondaryFill(prisma, fill);
  }
}

async function persistPrimaryFill(
  prisma: Prisma.TransactionClient,
  fill: Extract<OrderFill, { kind: "PRIMARY" }>,
) {
  const yesOrder = await orderForUser(prisma, fill, fill.yesBuyerUserId);
  const noOrder = await orderForUser(prisma, fill, fill.noBuyerUserId);
  const yesCostCents = fill.yesPrice * fill.quantity;
  const noCostCents = fill.noPrice * fill.quantity;
  const collateralCents = 100 * fill.quantity;

  await spendLockedCash(prisma, yesOrder, fill.yesPrice, fill.quantity);
  await spendLockedCash(prisma, noOrder, fill.noPrice, fill.quantity);
  await incrementPosition(prisma, fill.yesBuyerUserId, yesOrder.marketId, "YES", fill.quantity);
  await incrementPosition(prisma, fill.noBuyerUserId, noOrder.marketId, "NO", fill.quantity);
  await prisma.market.update({
    where: { id: yesOrder.marketId },
    data: { collateralCents: { increment: collateralCents } },
  });

  const trade = await prisma.trade.create({
    data: {
      marketId: yesOrder.marketId,
      kind: "PRIMARY",
      quantity: fill.quantity,
      yesPriceCents: fill.yesPrice,
      noPriceCents: fill.noPrice,
      yesBuyerUserId: fill.yesBuyerUserId,
      noBuyerUserId: fill.noBuyerUserId,
    },
  });

  await prisma.ledgerEntry.createMany({
    data: [
      {
        userId: fill.yesBuyerUserId,
        marketId: yesOrder.marketId,
        type: "PRIMARY_BUY_YES",
        amountCents: -yesCostCents,
        metadataJson: JSON.stringify({ tradeId: trade.id, orderId: yesOrder.id }),
      },
      {
        userId: fill.noBuyerUserId,
        marketId: yesOrder.marketId,
        type: "PRIMARY_BUY_NO",
        amountCents: -noCostCents,
        metadataJson: JSON.stringify({ tradeId: trade.id, orderId: noOrder.id }),
      },
      {
        marketId: yesOrder.marketId,
        type: "PRIMARY_COLLATERAL",
        amountCents: collateralCents,
        metadataJson: JSON.stringify({ tradeId: trade.id }),
      },
    ],
  });

  await audit(prisma, {
    action: "PRIMARY_TRADE_CREATED",
    entityType: "Trade",
    entityId: trade.id,
    metadata: {
      tradeId: trade.id,
      marketId: yesOrder.marketId,
      quantity: fill.quantity,
      yesPriceCents: fill.yesPrice,
      noPriceCents: fill.noPrice,
      yesOrderId: yesOrder.id,
      noOrderId: noOrder.id,
    },
  });
}

async function persistSecondaryFill(
  prisma: Prisma.TransactionClient,
  fill: Extract<OrderFill, { kind: "SECONDARY" }>,
) {
  const buyerOrder = await orderForUser(prisma, fill, fill.buyerUserId);
  const sellerOrder = await orderForUser(prisma, fill, fill.sellerUserId);
  const tradeAmountCents = fill.price * fill.quantity;

  await spendLockedCash(prisma, buyerOrder, fill.price, fill.quantity);
  await releaseLockedShares(prisma, sellerOrder, fill.quantity);
  await prisma.user.update({
    where: { id: fill.sellerUserId },
    data: { availableCents: { increment: tradeAmountCents } },
  });
  await incrementPosition(
    prisma,
    fill.buyerUserId,
    buyerOrder.marketId,
    fill.outcome,
    fill.quantity,
  );

  const trade = await prisma.trade.create({
    data: {
      marketId: buyerOrder.marketId,
      kind: "SECONDARY",
      outcome: fill.outcome,
      quantity: fill.quantity,
      priceCents: fill.price,
      buyerUserId: fill.buyerUserId,
      sellerUserId: fill.sellerUserId,
    },
  });

  await prisma.ledgerEntry.createMany({
    data: [
      {
        userId: fill.buyerUserId,
        marketId: buyerOrder.marketId,
        type: "SECONDARY_BUY",
        amountCents: -tradeAmountCents,
        metadataJson: JSON.stringify({ tradeId: trade.id, orderId: buyerOrder.id }),
      },
      {
        userId: fill.sellerUserId,
        marketId: buyerOrder.marketId,
        type: "SECONDARY_SELL",
        amountCents: tradeAmountCents,
        metadataJson: JSON.stringify({ tradeId: trade.id, orderId: sellerOrder.id }),
      },
    ],
  });

  await audit(prisma, {
    action: "SECONDARY_TRADE_CREATED",
    entityType: "Trade",
    entityId: trade.id,
    metadata: {
      tradeId: trade.id,
      marketId: buyerOrder.marketId,
      quantity: fill.quantity,
      outcome: fill.outcome,
      priceCents: fill.price,
      buyerOrderId: buyerOrder.id,
      sellerOrderId: sellerOrder.id,
    },
  });
}

async function spendLockedCash(
  prisma: Prisma.TransactionClient,
  order: Order,
  priceCents: number,
  quantity: number,
) {
  const reservedCents = order.limitPriceCents * quantity;
  const spentCents = priceCents * quantity;
  const surplusCents = reservedCents - spentCents;

  await prisma.user.update({
    where: { id: order.userId },
    data: {
      availableCents: { increment: surplusCents },
      lockedCents: { decrement: reservedCents },
    },
  });
  await applyOrderFill(prisma, order, quantity, {
    lockedCents: { decrement: reservedCents },
  });
}

async function releaseLockedShares(
  prisma: Prisma.TransactionClient,
  order: Order,
  quantity: number,
) {
  await prisma.position.update({
    where: {
      userId_marketId_outcome: {
        userId: order.userId,
        marketId: order.marketId,
        outcome: order.outcome,
      },
    },
    data: { lockedQuantity: { decrement: quantity } },
  });
  await applyOrderFill(prisma, order, quantity, {
    lockedQuantity: { decrement: quantity },
  });
}

async function applyOrderFill(
  prisma: Prisma.TransactionClient,
  order: Order,
  quantity: number,
  lockUpdate: Pick<Prisma.OrderUpdateInput, "lockedCents" | "lockedQuantity">,
) {
  const current = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  const remainingQuantity = current.remainingQuantity - quantity;
  await prisma.order.update({
    where: { id: order.id },
    data: {
      ...lockUpdate,
      remainingQuantity,
      status: remainingQuantity === 0 ? "FILLED" : "PARTIALLY_FILLED",
    },
  });
}

async function incrementPosition(
  prisma: Prisma.TransactionClient,
  userId: string,
  marketId: string,
  outcome: Outcome,
  quantity: number,
) {
  await prisma.position.upsert({
    where: {
      userId_marketId_outcome: {
        userId,
        marketId,
        outcome,
      },
    },
    create: {
      userId,
      marketId,
      outcome,
      availableQuantity: quantity,
    },
    update: {
      availableQuantity: { increment: quantity },
    },
  });
}

async function releaseOrderLocks(prisma: OrdersPrisma, order: Order) {
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
}

async function orderForUser(
  prisma: Prisma.TransactionClient,
  fill: OrderFill,
  userId: string,
) {
  const orderId =
    fill.restingOrderId === fill.incomingOrderId
      ? fill.incomingOrderId
      : await userOwnsOrder(prisma, fill.restingOrderId, userId)
        ? fill.restingOrderId
        : fill.incomingOrderId;

  return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
}

async function userOwnsOrder(
  prisma: Prisma.TransactionClient,
  orderId: string,
  userId: string,
) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  return order.userId === userId;
}

function toBookOrder(order: Order): BookOrder {
  return {
    id: order.id,
    userId: order.userId,
    marketId: order.marketId,
    outcome: order.outcome as Outcome,
    action: order.action as OrderAction,
    limitPrice: order.limitPriceCents,
    remainingQuantity: order.remainingQuantity,
    createdAtMs: order.createdAt.getTime(),
  };
}
