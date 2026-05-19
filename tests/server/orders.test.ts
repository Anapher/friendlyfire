import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cancelOrder, placeLimitOrder } from "@/server/orders";
import { createIsolatedPrisma, resetTestDb } from "./helpers";

const db = createIsolatedPrisma("orders");
const prisma = db.prisma;

async function createUser(name: string, availableCents = 0) {
  return prisma.user.create({
    data: {
      name,
      email: `${name.toLowerCase()}-${crypto.randomUUID()}@test.dev`,
      availableCents,
    },
  });
}

async function createMarket(creatorId: string) {
  return prisma.market.create({
    data: {
      creatorId,
      question: "Will the demo work?",
      description: "Test market",
      resolutionCriteria: "YES if the demo works.",
      closeTime: new Date(Date.now() + 86_400_000),
      status: "OPEN",
    },
  });
}

describe("orders", () => {
  beforeEach(async () => {
    await resetTestDb(prisma);
  });

  afterAll(async () => {
    await db.cleanup();
  });

  it("locks cash for an unmatched buy order", async () => {
    const user = await createUser("Buyer", 1000);
    const market = await createMarket(user.id);

    const order = await placeLimitOrder(prisma, {
      userId: user.id,
      marketId: market.id,
      outcome: "YES",
      action: "BUY",
      limitPriceCents: 40,
      quantity: 3,
    });

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(order.status).toBe("OPEN");
    expect(order.remainingQuantity).toBe(3);
    expect(order.lockedCents).toBe(120);
    expect(updatedUser.availableCents).toBe(880);
    expect(updatedUser.lockedCents).toBe(120);
  });

  it("locks owned shares for an unmatched sell order", async () => {
    const user = await createUser("Seller");
    const market = await createMarket(user.id);
    await prisma.position.create({
      data: {
        userId: user.id,
        marketId: market.id,
        outcome: "YES",
        availableQuantity: 5,
      },
    });

    const order = await placeLimitOrder(prisma, {
      userId: user.id,
      marketId: market.id,
      outcome: "YES",
      action: "SELL",
      limitPriceCents: 55,
      quantity: 2,
    });

    const position = await prisma.position.findUniqueOrThrow({
      where: { userId_marketId_outcome: { userId: user.id, marketId: market.id, outcome: "YES" } },
    });

    expect(order.status).toBe("OPEN");
    expect(order.lockedQuantity).toBe(2);
    expect(position.availableQuantity).toBe(3);
    expect(position.lockedQuantity).toBe(2);
  });

  it("rejects a sell order when the user does not own enough shares", async () => {
    const user = await createUser("EmptySeller");
    const market = await createMarket(user.id);

    await expect(
      placeLimitOrder(prisma, {
        userId: user.id,
        marketId: market.id,
        outcome: "YES",
        action: "SELL",
        limitPriceCents: 55,
        quantity: 1,
      }),
    ).rejects.toThrow("Insufficient shares available");

    await expect(prisma.order.count()).resolves.toBe(0);
  });

  it("rejects order placement by a blacklisted user", async () => {
    const creator = await createUser("Creator", 1000);
    const trader = await createUser("Blacklisted", 1000);
    const market = await createMarket(creator.id);
    await prisma.marketBlacklist.create({
      data: {
        marketId: market.id,
        userId: trader.id,
        createdById: creator.id,
        note: "conflict",
      },
    });

    await expect(
      placeLimitOrder(prisma, {
        userId: trader.id,
        marketId: market.id,
        outcome: "YES",
        action: "BUY",
        limitPriceCents: 50,
        quantity: 1,
      }),
    ).rejects.toThrow("Blacklisted users cannot place orders on this market");

    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: trader.id } });
    expect(unchanged.availableCents).toBe(1000);
    expect(unchanged.lockedCents).toBe(0);
  });

  it("matches complementary YES and NO buys into positions and market collateral", async () => {
    const yesBuyer = await createUser("YesBuyer", 1000);
    const noBuyer = await createUser("NoBuyer", 1000);
    const market = await createMarket(yesBuyer.id);

    await placeLimitOrder(prisma, {
      userId: yesBuyer.id,
      marketId: market.id,
      outcome: "YES",
      action: "BUY",
      limitPriceCents: 63,
      quantity: 2,
    });
    const incoming = await placeLimitOrder(prisma, {
      userId: noBuyer.id,
      marketId: market.id,
      outcome: "NO",
      action: "BUY",
      limitPriceCents: 40,
      quantity: 2,
    });

    const updatedMarket = await prisma.market.findUniqueOrThrow({ where: { id: market.id } });
    const updatedYesBuyer = await prisma.user.findUniqueOrThrow({ where: { id: yesBuyer.id } });
    const updatedNoBuyer = await prisma.user.findUniqueOrThrow({ where: { id: noBuyer.id } });
    const yesPosition = await prisma.position.findUniqueOrThrow({
      where: {
        userId_marketId_outcome: { userId: yesBuyer.id, marketId: market.id, outcome: "YES" },
      },
    });
    const noPosition = await prisma.position.findUniqueOrThrow({
      where: {
        userId_marketId_outcome: { userId: noBuyer.id, marketId: market.id, outcome: "NO" },
      },
    });
    const orders = await prisma.order.findMany({ orderBy: { createdAt: "asc" } });
    const trade = await prisma.trade.findFirstOrThrow();
    const ledgerEntries = await prisma.ledgerEntry.findMany();
    const auditEntries = await prisma.auditLog.findMany();

    expect(incoming.status).toBe("FILLED");
    expect(updatedMarket.collateralCents).toBe(200);
    expect(updatedYesBuyer.availableCents).toBe(874);
    expect(updatedYesBuyer.lockedCents).toBe(0);
    expect(updatedNoBuyer.availableCents).toBe(926);
    expect(updatedNoBuyer.lockedCents).toBe(0);
    expect(yesPosition.availableQuantity).toBe(2);
    expect(noPosition.availableQuantity).toBe(2);
    expect(orders.map((order) => order.status)).toEqual(["FILLED", "FILLED"]);
    expect(orders.map((order) => order.lockedCents)).toEqual([0, 0]);
    expect(trade).toMatchObject({
      kind: "PRIMARY",
      quantity: 2,
      yesPriceCents: 63,
      noPriceCents: 37,
      yesBuyerUserId: yesBuyer.id,
      noBuyerUserId: noBuyer.id,
    });
    expect(ledgerEntries.length).toBeGreaterThan(0);
    expect(auditEntries.length).toBeGreaterThan(0);
  });

  it("matches secondary same-outcome buy and sell orders by transferring shares and cash", async () => {
    const seller = await createUser("ShareSeller", 0);
    const buyer = await createUser("ShareBuyer", 1000);
    const market = await createMarket(seller.id);
    await prisma.position.create({
      data: {
        userId: seller.id,
        marketId: market.id,
        outcome: "YES",
        availableQuantity: 3,
      },
    });

    await placeLimitOrder(prisma, {
      userId: seller.id,
      marketId: market.id,
      outcome: "YES",
      action: "SELL",
      limitPriceCents: 45,
      quantity: 2,
    });
    await placeLimitOrder(prisma, {
      userId: buyer.id,
      marketId: market.id,
      outcome: "YES",
      action: "BUY",
      limitPriceCents: 50,
      quantity: 2,
    });

    const updatedSeller = await prisma.user.findUniqueOrThrow({ where: { id: seller.id } });
    const updatedBuyer = await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } });
    const sellerPosition = await prisma.position.findUniqueOrThrow({
      where: { userId_marketId_outcome: { userId: seller.id, marketId: market.id, outcome: "YES" } },
    });
    const buyerPosition = await prisma.position.findUniqueOrThrow({
      where: { userId_marketId_outcome: { userId: buyer.id, marketId: market.id, outcome: "YES" } },
    });
    const trade = await prisma.trade.findFirstOrThrow();

    expect(updatedSeller.availableCents).toBe(90);
    expect(updatedBuyer.availableCents).toBe(910);
    expect(updatedBuyer.lockedCents).toBe(0);
    expect(sellerPosition.availableQuantity).toBe(1);
    expect(sellerPosition.lockedQuantity).toBe(0);
    expect(buyerPosition.availableQuantity).toBe(2);
    expect(trade).toMatchObject({
      kind: "SECONDARY",
      outcome: "YES",
      quantity: 2,
      priceCents: 45,
      buyerUserId: buyer.id,
      sellerUserId: seller.id,
    });
  });

  it("releases surplus locked cash when a buy fills below its limit", async () => {
    const seller = await createUser("CheapSeller", 0);
    const buyer = await createUser("HighBuyer", 1000);
    const market = await createMarket(seller.id);
    await prisma.position.create({
      data: {
        userId: seller.id,
        marketId: market.id,
        outcome: "NO",
        availableQuantity: 1,
      },
    });

    await placeLimitOrder(prisma, {
      userId: seller.id,
      marketId: market.id,
      outcome: "NO",
      action: "SELL",
      limitPriceCents: 30,
      quantity: 1,
    });
    const buy = await placeLimitOrder(prisma, {
      userId: buyer.id,
      marketId: market.id,
      outcome: "NO",
      action: "BUY",
      limitPriceCents: 50,
      quantity: 1,
    });

    const updatedBuyer = await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } });
    const persistedBuy = await prisma.order.findUniqueOrThrow({ where: { id: buy.id } });

    expect(updatedBuyer.availableCents).toBe(970);
    expect(updatedBuyer.lockedCents).toBe(0);
    expect(persistedBuy.lockedCents).toBe(0);
  });

  it("leaves the unmatched remainder of a partially filled order open", async () => {
    const seller = await createUser("PartialSeller", 0);
    const buyer = await createUser("PartialBuyer", 1000);
    const market = await createMarket(seller.id);
    await prisma.position.create({
      data: {
        userId: seller.id,
        marketId: market.id,
        outcome: "YES",
        availableQuantity: 1,
      },
    });

    await placeLimitOrder(prisma, {
      userId: seller.id,
      marketId: market.id,
      outcome: "YES",
      action: "SELL",
      limitPriceCents: 40,
      quantity: 1,
    });
    const buy = await placeLimitOrder(prisma, {
      userId: buyer.id,
      marketId: market.id,
      outcome: "YES",
      action: "BUY",
      limitPriceCents: 40,
      quantity: 3,
    });

    const updatedBuyer = await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } });
    const persistedBuy = await prisma.order.findUniqueOrThrow({ where: { id: buy.id } });
    const buyerPosition = await prisma.position.findUniqueOrThrow({
      where: { userId_marketId_outcome: { userId: buyer.id, marketId: market.id, outcome: "YES" } },
    });

    expect(persistedBuy.status).toBe("PARTIALLY_FILLED");
    expect(persistedBuy.remainingQuantity).toBe(2);
    expect(persistedBuy.lockedCents).toBe(80);
    expect(updatedBuyer.availableCents).toBe(880);
    expect(updatedBuyer.lockedCents).toBe(80);
    expect(buyerPosition.availableQuantity).toBe(1);
  });

  it("lets only the owner cancel an open order and releases the remaining lock", async () => {
    const owner = await createUser("CancelOwner", 1000);
    const other = await createUser("CancelOther", 1000);
    const market = await createMarket(owner.id);
    const order = await placeLimitOrder(prisma, {
      userId: owner.id,
      marketId: market.id,
      outcome: "YES",
      action: "BUY",
      limitPriceCents: 25,
      quantity: 4,
    });

    await expect(
      cancelOrder(prisma, {
        actorUserId: other.id,
        orderId: order.id,
      }),
    ).rejects.toThrow("Only the order owner can cancel an order");

    const cancelled = await cancelOrder(prisma, {
      actorUserId: owner.id,
      orderId: order.id,
    });
    const updatedOwner = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: "ORDER_CANCELLED" },
    });

    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.lockedCents).toBe(0);
    expect(updatedOwner.availableCents).toBe(1000);
    expect(updatedOwner.lockedCents).toBe(0);
    expect(auditEntry.entityId).toBe(order.id);
  });
});
