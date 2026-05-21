import type { OrderAction, Outcome } from "@/domain/types";

export type BookOrderInput = {
  outcome: string;
  action: string;
  limitPriceCents: number;
  remainingQuantity: number;
};

export type BookLevel = {
  outcome: Outcome;
  action: OrderAction;
  priceCents: number;
  quantity: number;
};

export function summarizeBook(orders: BookOrderInput[]): BookLevel[] {
  const levels = new Map<string, BookLevel>();
  for (const order of orders) {
    const key = `${order.outcome}:${order.action}:${order.limitPriceCents}`;
    const existing = levels.get(key);
    if (existing) {
      existing.quantity += order.remainingQuantity;
      continue;
    }
    levels.set(key, {
      outcome: order.outcome as Outcome,
      action: order.action as OrderAction,
      priceCents: order.limitPriceCents,
      quantity: order.remainingQuantity,
    });
  }

  return [...levels.values()].sort((a, b) => {
    if (a.outcome !== b.outcome) {
      return a.outcome.localeCompare(b.outcome);
    }
    if (a.action !== b.action) {
      return a.action.localeCompare(b.action);
    }
    return a.action === "BUY" ? b.priceCents - a.priceCents : a.priceCents - b.priceCents;
  });
}

export type LadderRow = {
  priceCents: number;
  bidQuantity: number;
  askQuantity: number;
};

export function buildLadder(levels: BookLevel[], outcome: Outcome): LadderRow[] {
  const buys = levels.filter((l) => l.outcome === outcome && l.action === "BUY");
  const sells = levels.filter((l) => l.outcome === outcome && l.action === "SELL");
  const allPrices = new Set<number>([
    ...buys.map((l) => l.priceCents),
    ...sells.map((l) => l.priceCents),
  ]);
  return [...allPrices]
    .sort((a, b) => b - a)
    .map((priceCents) => ({
      priceCents,
      bidQuantity: buys.find((l) => l.priceCents === priceCents)?.quantity ?? 0,
      askQuantity: sells.find((l) => l.priceCents === priceCents)?.quantity ?? 0,
    }));
}

export type BestPrices = {
  bestBidCents: number | null;
  bestAskCents: number | null;
};

export type CheapestTradePrices = {
  yesCents: number | null;
  noCents: number | null;
};

export function bestPrices(rows: LadderRow[]): BestPrices {
  const bestBidCents = rows
    .filter((r) => r.bidQuantity > 0)
    .reduce<number | null>((best, row) => {
      return best === null || row.priceCents > best ? row.priceCents : best;
    }, null);
  const bestAskCents = rows
    .filter((r) => r.askQuantity > 0)
    .reduce<number | null>((best, row) => {
      return best === null || row.priceCents < best ? row.priceCents : best;
    }, null);
  return { bestBidCents, bestAskCents };
}

export function cheapestTradePrices(levels: BookLevel[]): CheapestTradePrices {
  const yesAsk = lowestPrice(levels, "YES", "SELL");
  const noBid = highestPrice(levels, "NO", "BUY");
  const noAsk = lowestPrice(levels, "NO", "SELL");
  const yesBid = highestPrice(levels, "YES", "BUY");

  return {
    yesCents: minNullable(yesAsk, noBid === null ? null : 100 - noBid),
    noCents: minNullable(noAsk, yesBid === null ? null : 100 - yesBid),
  };
}

function lowestPrice(levels: BookLevel[], outcome: Outcome, action: OrderAction) {
  return levels
    .filter((level) => level.outcome === outcome && level.action === action && level.quantity > 0)
    .reduce<number | null>((best, level) => {
      return best === null || level.priceCents < best ? level.priceCents : best;
    }, null);
}

function highestPrice(levels: BookLevel[], outcome: Outcome, action: OrderAction) {
  return levels
    .filter((level) => level.outcome === outcome && level.action === action && level.quantity > 0)
    .reduce<number | null>((best, level) => {
      return best === null || level.priceCents > best ? level.priceCents : best;
    }, null);
}

function minNullable(left: number | null, right: number | null) {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return Math.min(left, right);
}
