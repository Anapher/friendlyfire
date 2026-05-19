import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeExpiredMarkets, correctMarketResolution, resolveMarket } from "@/server/markets";
import { placeLimitOrder } from "@/server/orders";
import { createIsolatedPrisma, resetTestDb } from "./helpers";

const db = createIsolatedPrisma("settlement");
const prisma = db.prisma;

async function createUser(name: string, availableCents = 0, role = "USER") {
  return prisma.user.create({
    data: {
      name,
      email: `${name.toLowerCase()}-${crypto.randomUUID()}@test.dev`,
      availableCents,
      role,
    },
  });
}

async function createMarket(creatorId: string, closeTime = new Date(Date.now() + 86_400_000)) {
  return prisma.market.create({
    data: {
      creatorId,
      question: "Will settlement work?",
      description: "Test market",
      resolutionCriteria: "Resolve from test facts.",
      closeTime,
      status: "OPEN",
    },
  });
}

async function createPrimaryFill(input: {
  yesUserId: string;
  noUserId: string;
  marketId: string;
  quantity: number;
  yesPriceCents?: number;
}) {
  const yesPriceCents = input.yesPriceCents ?? 60;
  await placeLimitOrder(prisma, {
    userId: input.yesUserId,
    marketId: input.marketId,
    outcome: "YES",
    action: "BUY",
    limitPriceCents: yesPriceCents,
    quantity: input.quantity,
  });
  await placeLimitOrder(prisma, {
    userId: input.noUserId,
    marketId: input.marketId,
    outcome: "NO",
    action: "BUY",
    limitPriceCents: 100 - yesPriceCents,
    quantity: input.quantity,
  });
}

describe("market settlement", () => {
  beforeEach(async () => {
    await resetTestDb(prisma);
  });

  afterAll(async () => {
    await db.cleanup();
  });

  it("early resolution cancels open orders, releases locks, pays winners, zeroes collateral, and marks resolved", async () => {
    const creator = await createUser("Creator", 1000);
    const yesTrader = await createUser("YesTrader", 1000);
    const noTrader = await createUser("NoTrader", 1000);
    const market = await createMarket(creator.id);
    await createPrimaryFill({
      yesUserId: yesTrader.id,
      noUserId: noTrader.id,
      marketId: market.id,
      quantity: 3,
    });
    const sellOrder = await placeLimitOrder(prisma, {
      userId: yesTrader.id,
      marketId: market.id,
      outcome: "YES",
      action: "SELL",
      limitPriceCents: 90,
      quantity: 1,
    });
    const buyOrder = await placeLimitOrder(prisma, {
      userId: noTrader.id,
      marketId: market.id,
      outcome: "YES",
      action: "BUY",
      limitPriceCents: 10,
      quantity: 1,
    });

    const resolved = await resolveMarket(prisma, {
      actorUserId: yesTrader.id,
      marketId: market.id,
      resolution: "YES",
      note: "event happened",
    });

    const updatedMarket = await prisma.market.findUniqueOrThrow({ where: { id: market.id } });
    const updatedYesTrader = await prisma.user.findUniqueOrThrow({ where: { id: yesTrader.id } });
    const updatedNoTrader = await prisma.user.findUniqueOrThrow({ where: { id: noTrader.id } });
    const orders = await prisma.order.findMany({
      where: { id: { in: [sellOrder.id, buyOrder.id] } },
      orderBy: { createdAt: "asc" },
    });
    const positions = await prisma.position.findMany({
      where: { marketId: market.id },
      orderBy: [{ userId: "asc" }, { outcome: "asc" }],
    });
    const settlementEntries = await prisma.ledgerEntry.findMany({
      where: {
        type: { in: ["MARKET_PAYOUT", "MARKET_SETTLEMENT_COLLATERAL"] },
        amountCents: { not: 0 },
      },
      orderBy: { amountCents: "desc" },
    });
    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: "MARKET_RESOLVED" },
    });

    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.resolution).toBe("YES");
    expect(updatedMarket.collateralCents).toBe(0);
    expect(updatedYesTrader.availableCents).toBe(1120);
    expect(updatedYesTrader.lockedCents).toBe(0);
    expect(updatedNoTrader.availableCents).toBe(880);
    expect(updatedNoTrader.lockedCents).toBe(0);
    expect(orders.map((order) => order.status)).toEqual(["CANCELLED", "CANCELLED"]);
    expect(orders.map((order) => order.lockedCents)).toEqual([0, 0]);
    expect(orders.map((order) => order.lockedQuantity)).toEqual([0, 0]);
    expect(positions.every((position) => position.availableQuantity === 0)).toBe(true);
    expect(positions.every((position) => position.lockedQuantity === 0)).toBe(true);
    expect(settlementEntries.map((entry) => entry.amountCents)).toEqual([300, -300]);
    expect(auditEntry.actorUserId).toBe(yesTrader.id);
  });

  it("natural close blocks new orders, then later resolution settles", async () => {
    const creator = await createUser("CloseCreator", 1000);
    const yesTrader = await createUser("CloseYes", 1000);
    const noTrader = await createUser("CloseNo", 1000);
    const market = await createMarket(creator.id, new Date("2026-05-18T12:00:00.000Z"));
    await createPrimaryFill({
      yesUserId: yesTrader.id,
      noUserId: noTrader.id,
      marketId: market.id,
      quantity: 2,
    });

    await closeExpiredMarkets(prisma, new Date("2026-05-19T12:00:00.000Z"));
    await expect(
      placeLimitOrder(prisma, {
        userId: yesTrader.id,
        marketId: market.id,
        outcome: "YES",
        action: "BUY",
        limitPriceCents: 50,
        quantity: 1,
      }),
    ).rejects.toThrow("Only open markets can accept orders");

    await resolveMarket(prisma, {
      actorUserId: noTrader.id,
      marketId: market.id,
      resolution: "CANCELLED",
      note: "could not verify",
    });

    const updatedMarket = await prisma.market.findUniqueOrThrow({ where: { id: market.id } });
    const updatedYesTrader = await prisma.user.findUniqueOrThrow({ where: { id: yesTrader.id } });
    const updatedNoTrader = await prisma.user.findUniqueOrThrow({ where: { id: noTrader.id } });

    expect(updatedMarket.status).toBe("RESOLVED");
    expect(updatedMarket.resolution).toBe("CANCELLED");
    expect(updatedMarket.collateralCents).toBe(0);
    expect(updatedYesTrader.availableCents).toBe(980);
    expect(updatedNoTrader.availableCents).toBe(1020);
  });

  it("admin correction creates reversal entries and a second resolution audit entry", async () => {
    const admin = await createUser("Admin", 0, "ADMIN");
    const yesTrader = await createUser("CorrectYes", 1000);
    const noTrader = await createUser("CorrectNo", 1000);
    const market = await createMarket(admin.id);
    await createPrimaryFill({
      yesUserId: yesTrader.id,
      noUserId: noTrader.id,
      marketId: market.id,
      quantity: 1,
    });
    await resolveMarket(prisma, {
      actorUserId: yesTrader.id,
      marketId: market.id,
      resolution: "YES",
      note: "initial call",
    });

    await correctMarketResolution(prisma, {
      actorUserId: admin.id,
      marketId: market.id,
      resolution: "NO",
      note: "admin correction",
    });

    const updatedMarket = await prisma.market.findUniqueOrThrow({ where: { id: market.id } });
    const updatedYesTrader = await prisma.user.findUniqueOrThrow({ where: { id: yesTrader.id } });
    const updatedNoTrader = await prisma.user.findUniqueOrThrow({ where: { id: noTrader.id } });
    const reversalEntries = await prisma.ledgerEntry.findMany({
      where: { type: "MARKET_PAYOUT_REVERSAL" },
      orderBy: { amountCents: "asc" },
    });
    const payoutEntries = await prisma.ledgerEntry.findMany({
      where: { type: "MARKET_CORRECTION_PAYOUT" },
    });
    const resolutionAudits = await prisma.auditLog.findMany({
      where: { action: "MARKET_RESOLVED" },
      orderBy: { createdAt: "asc" },
    });
    const correctionAudit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "MARKET_RESOLUTION_CORRECTED" },
    });

    expect(updatedMarket.resolution).toBe("NO");
    expect(updatedMarket.resolutionNote).toBe("admin correction");
    expect(updatedMarket.resolvedById).toBe(admin.id);
    expect(updatedMarket.collateralCents).toBe(0);
    expect(updatedYesTrader.availableCents).toBe(940);
    expect(updatedNoTrader.availableCents).toBe(1060);
    expect(reversalEntries.map((entry) => entry.amountCents)).toEqual([-100, 100]);
    expect(payoutEntries).toHaveLength(1);
    expect(payoutEntries[0].userId).toBe(noTrader.id);
    expect(payoutEntries[0].amountCents).toBe(100);
    expect(resolutionAudits).toHaveLength(2);
    expect(resolutionAudits[1].actorUserId).toBe(admin.id);
    expect(correctionAudit.actorUserId).toBe(admin.id);
  });

  it("admin can safely correct a market more than once", async () => {
    const admin = await createUser("RepeatAdmin", 0, "ADMIN");
    const yesTrader = await createUser("RepeatYes", 1000);
    const noTrader = await createUser("RepeatNo", 1000);
    const market = await createMarket(admin.id);
    await createPrimaryFill({
      yesUserId: yesTrader.id,
      noUserId: noTrader.id,
      marketId: market.id,
      quantity: 1,
    });
    await resolveMarket(prisma, {
      actorUserId: yesTrader.id,
      marketId: market.id,
      resolution: "YES",
      note: "initial call",
    });
    await correctMarketResolution(prisma, {
      actorUserId: admin.id,
      marketId: market.id,
      resolution: "NO",
      note: "first correction",
    });

    await correctMarketResolution(prisma, {
      actorUserId: admin.id,
      marketId: market.id,
      resolution: "CANCELLED",
      note: "second correction",
    });

    const updatedMarket = await prisma.market.findUniqueOrThrow({ where: { id: market.id } });
    const updatedYesTrader = await prisma.user.findUniqueOrThrow({ where: { id: yesTrader.id } });
    const updatedNoTrader = await prisma.user.findUniqueOrThrow({ where: { id: noTrader.id } });
    const reversalEntries = await prisma.ledgerEntry.findMany({
      where: { type: "MARKET_PAYOUT_REVERSAL" },
      orderBy: { amountCents: "asc" },
    });
    const resolutionAudits = await prisma.auditLog.findMany({
      where: { action: "MARKET_RESOLVED" },
      orderBy: { createdAt: "asc" },
    });

    expect(updatedMarket.resolution).toBe("CANCELLED");
    expect(updatedMarket.collateralCents).toBe(0);
    expect(updatedYesTrader.availableCents).toBe(990);
    expect(updatedNoTrader.availableCents).toBe(1010);
    expect(reversalEntries.map((entry) => entry.amountCents)).toEqual([-100, -100, 100, 100]);
    expect(resolutionAudits).toHaveLength(3);
  });

  it("rejects correction when the current payout cannot be clawed back", async () => {
    const admin = await createUser("ClawbackAdmin", 0, "ADMIN");
    const yesTrader = await createUser("ClawbackYes", 1000);
    const noTrader = await createUser("ClawbackNo", 1000);
    const market = await createMarket(admin.id);
    await createPrimaryFill({
      yesUserId: yesTrader.id,
      noUserId: noTrader.id,
      marketId: market.id,
      quantity: 1,
    });
    await resolveMarket(prisma, {
      actorUserId: yesTrader.id,
      marketId: market.id,
      resolution: "YES",
      note: "initial call",
    });
    await prisma.user.update({
      where: { id: yesTrader.id },
      data: { availableCents: 40 },
    });
    const beforeMarket = await prisma.market.findUniqueOrThrow({ where: { id: market.id } });
    const beforeNoTrader = await prisma.user.findUniqueOrThrow({ where: { id: noTrader.id } });
    const beforeLedgerCount = await prisma.ledgerEntry.count();
    const beforeAuditCount = await prisma.auditLog.count();

    await expect(
      correctMarketResolution(prisma, {
        actorUserId: admin.id,
        marketId: market.id,
        resolution: "NO",
        note: "cannot claw back",
      }),
    ).rejects.toThrow("Insufficient available balance to reverse settlement payout");

    const afterMarket = await prisma.market.findUniqueOrThrow({ where: { id: market.id } });
    const afterYesTrader = await prisma.user.findUniqueOrThrow({ where: { id: yesTrader.id } });
    const afterNoTrader = await prisma.user.findUniqueOrThrow({ where: { id: noTrader.id } });
    const afterLedgerCount = await prisma.ledgerEntry.count();
    const afterAuditCount = await prisma.auditLog.count();

    expect(afterMarket.resolution).toBe(beforeMarket.resolution);
    expect(afterMarket.resolutionNote).toBe(beforeMarket.resolutionNote);
    expect(afterMarket.resolvedById).toBe(beforeMarket.resolvedById);
    expect(afterMarket.collateralCents).toBe(beforeMarket.collateralCents);
    expect(afterYesTrader.availableCents).toBe(40);
    expect(afterNoTrader.availableCents).toBe(beforeNoTrader.availableCents);
    expect(afterLedgerCount).toBe(beforeLedgerCount);
    expect(afterAuditCount).toBe(beforeAuditCount);
  });
});
