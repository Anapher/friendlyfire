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

  it("prefers a better secondary sell over worse primary issuance for an incoming buy", () => {
    const resting = [
      baseOrder({
        id: "no-buy",
        userId: "alice",
        outcome: "NO",
        action: "BUY",
        limitPrice: 40,
      }),
      baseOrder({
        id: "yes-sell",
        userId: "carol",
        outcome: "YES",
        action: "SELL",
        limitPrice: 10,
      }),
    ];
    const incoming = baseOrder({
      id: "yes-buy",
      userId: "bob",
      outcome: "YES",
      action: "BUY",
      limitPrice: 70,
    });

    const result = matchIncomingOrder(incoming, resting);

    expect(result.fills[0]).toEqual({
      kind: "SECONDARY",
      restingOrderId: "yes-sell",
      incomingOrderId: "yes-buy",
      quantity: 1,
      outcome: "YES",
      price: 10,
      buyerUserId: "bob",
      sellerUserId: "carol",
    });
  });

  it("leaves unmatched quantity open", () => {
    const incoming = baseOrder({ id: "buy", remainingQuantity: 3 });

    const result = matchIncomingOrder(incoming, []);

    expect(result.fills).toEqual([]);
    expect(result.incomingRemaining).toBe(3);
  });

  it("ignores zero and negative remaining resting orders", () => {
    const resting = [
      baseOrder({
        id: "sell-zero",
        userId: "alice",
        action: "SELL",
        limitPrice: 50,
        remainingQuantity: 0,
      }),
      baseOrder({
        id: "sell-negative",
        userId: "carol",
        action: "SELL",
        limitPrice: 50,
        remainingQuantity: -2,
      }),
      baseOrder({
        id: "sell-open",
        userId: "dave",
        action: "SELL",
        limitPrice: 50,
        remainingQuantity: 1,
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

    expect(result.fills).toEqual([
      {
        kind: "SECONDARY",
        restingOrderId: "sell-open",
        incomingOrderId: "buy",
        quantity: 1,
        outcome: "YES",
        price: 50,
        buyerUserId: "bob",
        sellerUserId: "dave",
      },
    ]);
    expect(result.incomingRemaining).toBe(1);
  });

  it("uses order id as deterministic final tie-breaker when price and timestamp are equal", () => {
    const resting = [
      baseOrder({
        id: "sell-b",
        userId: "alice",
        action: "SELL",
        limitPrice: 50,
        createdAtMs: 1,
      }),
      baseOrder({
        id: "sell-a",
        userId: "carol",
        action: "SELL",
        limitPrice: 50,
        createdAtMs: 1,
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
      "sell-a",
      "sell-b",
    ]);
  });

  it("does not match non-crossing complementary primary buys", () => {
    const resting = [
      baseOrder({
        id: "yes-1",
        userId: "alice",
        outcome: "YES",
        action: "BUY",
        limitPrice: 60,
      }),
    ];
    const incoming = baseOrder({
      id: "no-1",
      userId: "bob",
      outcome: "NO",
      action: "BUY",
      limitPrice: 39,
    });

    const result = matchIncomingOrder(incoming, resting);

    expect(result.fills).toEqual([]);
    expect(result.incomingRemaining).toBe(1);
  });

  it("does not match orders from the same user", () => {
    const resting = [
      baseOrder({
        id: "sell-1",
        userId: "alice",
        action: "SELL",
        limitPrice: 50,
      }),
    ];
    const incoming = baseOrder({
      id: "buy-1",
      userId: "alice",
      action: "BUY",
      limitPrice: 60,
    });

    const result = matchIncomingOrder(incoming, resting);

    expect(result.fills).toEqual([]);
    expect(result.incomingRemaining).toBe(1);
  });

  it("does not fill non-positive incoming quantities", () => {
    const resting = [
      baseOrder({
        id: "sell-1",
        userId: "alice",
        action: "SELL",
        limitPrice: 50,
      }),
    ];

    expect(
      matchIncomingOrder(
        baseOrder({
          id: "buy-zero",
          userId: "bob",
          action: "BUY",
          limitPrice: 60,
          remainingQuantity: 0,
        }),
        resting,
      ),
    ).toEqual({ fills: [], incomingRemaining: 0 });
    expect(
      matchIncomingOrder(
        baseOrder({
          id: "buy-negative",
          userId: "bob",
          action: "BUY",
          limitPrice: 60,
          remainingQuantity: -1,
        }),
        resting,
      ),
    ).toEqual({ fills: [], incomingRemaining: -1 });
  });
});
