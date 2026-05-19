import type { MarketId, OrderAction, OrderId, Outcome, UserId } from "./types";

export type BookOrder = {
  id: OrderId;
  userId: UserId;
  marketId: MarketId;
  outcome: Outcome;
  action: OrderAction;
  limitPrice: number;
  remainingQuantity: number;
  createdAtMs: number;
};

export type PrimaryFill = {
  kind: "PRIMARY";
  restingOrderId: OrderId;
  incomingOrderId: OrderId;
  quantity: number;
  yesPrice: number;
  noPrice: number;
  yesBuyerUserId: UserId;
  noBuyerUserId: UserId;
};

export type SecondaryFill = {
  kind: "SECONDARY";
  restingOrderId: OrderId;
  incomingOrderId: OrderId;
  quantity: number;
  outcome: Outcome;
  price: number;
  buyerUserId: UserId;
  sellerUserId: UserId;
};

export type OrderFill = PrimaryFill | SecondaryFill;

export function matchIncomingOrder(
  incoming: BookOrder,
  restingOrders: BookOrder[],
): { fills: OrderFill[]; incomingRemaining: number } {
  const fills: OrderFill[] = [];
  let incomingRemaining = incoming.remainingQuantity;

  if (incomingRemaining <= 0) {
    return { fills, incomingRemaining };
  }

  const candidates = restingOrders
    .filter((order) => order.marketId === incoming.marketId)
    .filter((order) => order.remainingQuantity > 0)
    .filter((order) => order.userId !== incoming.userId)
    .filter((order) => canMatch(incoming, order))
    .sort(
      (a, b) =>
        priority(incoming, a) - priority(incoming, b) ||
        a.createdAtMs - b.createdAtMs ||
        a.id.localeCompare(b.id),
    );

  for (const resting of candidates) {
    if (incomingRemaining === 0) break;

    const quantity = Math.min(incomingRemaining, resting.remainingQuantity);
    fills.push(toFill(incoming, resting, quantity));
    incomingRemaining -= quantity;
  }

  return { fills, incomingRemaining };
}

function canMatch(incoming: BookOrder, resting: BookOrder): boolean {
  if (
    incoming.action === "BUY" &&
    resting.action === "BUY" &&
    incoming.outcome !== resting.outcome
  ) {
    return incoming.limitPrice + resting.limitPrice >= 100;
  }

  if (incoming.outcome !== resting.outcome || incoming.action === resting.action) {
    return false;
  }

  const buyer = incoming.action === "BUY" ? incoming : resting;
  const seller = incoming.action === "SELL" ? incoming : resting;
  return buyer.limitPrice >= seller.limitPrice;
}

function priority(incoming: BookOrder, resting: BookOrder): number {
  if (incoming.action === "BUY" && resting.action === "BUY") {
    return 100 - resting.limitPrice;
  }

  if (incoming.action === "BUY") {
    return resting.limitPrice;
  }

  if (resting.action === "BUY") {
    return -resting.limitPrice;
  }

  return -(100 - resting.limitPrice);
}

function toFill(
  incoming: BookOrder,
  resting: BookOrder,
  quantity: number,
): OrderFill {
  if (incoming.action === "BUY" && resting.action === "BUY") {
    const restingPrice = resting.limitPrice;
    const incomingPrice = 100 - restingPrice;
    const yesOrder = incoming.outcome === "YES" ? incoming : resting;
    const noOrder = incoming.outcome === "NO" ? incoming : resting;

    return {
      kind: "PRIMARY",
      restingOrderId: resting.id,
      incomingOrderId: incoming.id,
      quantity,
      yesPrice: yesOrder.id === resting.id ? restingPrice : incomingPrice,
      noPrice: noOrder.id === resting.id ? restingPrice : incomingPrice,
      yesBuyerUserId: yesOrder.userId,
      noBuyerUserId: noOrder.userId,
    };
  }

  const buyer = incoming.action === "BUY" ? incoming : resting;
  const seller = incoming.action === "SELL" ? incoming : resting;

  return {
    kind: "SECONDARY",
    restingOrderId: resting.id,
    incomingOrderId: incoming.id,
    quantity,
    outcome: incoming.outcome,
    price: resting.limitPrice,
    buyerUserId: buyer.userId,
    sellerUserId: seller.userId,
  };
}
