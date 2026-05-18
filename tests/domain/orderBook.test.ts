import { describe, expect, it } from "vitest";
import { matchIncomingOrder, type BookOrder } from "@/domain/orderBook";

const baseOrder = (overrides: Partial<BookOrder>): BookOrder => ({
  id: "order",
  userId: "user",
  marketId: "market",
  outcome: "YES",
  action: "BUY",
  limitPrice: 50,
  remainingQuantity: 1,
  createdAtMs: 1,
  ...overrides,
});

describe("matchIncomingOrder", () => {
  it("creates primary YES/NO pairs when complementary buy limits sum to at least 100", () => {
    const resting = [
      baseOrder({
        id: "yes-1",
        userId: "alice",
        outcome: "YES",
        action: "BUY",
        limitPrice: 63,
      }),
    ];
    const incoming = baseOrder({
      id: "no-1",
      userId: "bob",
      outcome: "NO",
      action: "BUY",
      limitPrice: 40,
    });

    const result = matchIncomingOrder(incoming, resting);

    expect(result.fills).toEqual([
      {
        kind: "PRIMARY",
        restingOrderId: "yes-1",
        incomingOrderId: "no-1",
        quantity: 1,
        yesPrice: 63,
        noPrice: 37,
        yesBuyerUserId: "alice",
        noBuyerUserId: "bob",
      },
    ]);
    expect(result.incomingRemaining).toBe(0);
  });

  it("matches secondary same-outcome buy and sell orders at the resting price", () => {
    const resting = [
      baseOrder({
        id: "sell-1",
        userId: "alice",
        outcome: "YES",
        action: "SELL",
        limitPrice: 58,
      }),
    ];
    const incoming = baseOrder({
      id: "buy-1",
      userId: "bob",
      outcome: "YES",
      action: "BUY",
      limitPrice: 60,
    });

    const result = matchIncomingOrder(incoming, resting);

    expect(result.fills).toEqual([
      {
        kind: "SECONDARY",
        restingOrderId: "sell-1",
        incomingOrderId: "buy-1",
        quantity: 1,
        outcome: "YES",
        price: 58,
        buyerUserId: "bob",
        sellerUserId: "alice",
      },
    ]);
  });

  it("respects price-time priority for secondary fills", () => {
    const resting = [
      baseOrder({
        id: "sell-old",
        userId: "alice",
        action: "SELL",
        limitPrice: 55,
        createdAtMs: 1,
      }),
      baseOrder({
        id: "sell-better",
        userId: "carol",
        action: "SELL",
        limitPrice: 52,
        createdAtMs: 2,
      }),
    ];
    const incoming = baseOrder({
      id: "buy",
      userId: "bob",
      action: "BUY",
      limitPrice: 60,
      remainingQuantity: 2,
    });

    const result = matchIncomingOrder(incoming, resting);

    expect(result.fills.map((fill) => fill.restingOrderId)).toEqual([
      "sell-better",
      "sell-old",
    ]);
  });

  it("leaves unmatched quantity open", () => {
    const incoming = baseOrder({ id: "buy", remainingQuantity: 3 });

    const result = matchIncomingOrder(incoming, []);

    expect(result.fills).toEqual([]);
    expect(result.incomingRemaining).toBe(3);
  });
});
