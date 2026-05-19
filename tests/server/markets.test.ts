import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  addUserToMarketBlacklist,
  closeExpiredMarkets,
  createMarket,
  resolveMarket,
} from "@/server/markets";

const testDir = mkdtempSync(join(tmpdir(), "friendlyfire-markets-"));
const testDbPath = join(testDir, "test.db");
const testUrl = `file:${testDbPath}`;

closeSync(openSync(testDbPath, "w"));

execSync("npx prisma db push --skip-generate", {
  env: { ...process.env, DATABASE_URL: testUrl },
  stdio: "pipe",
});

const prisma = new PrismaClient({
  datasources: { db: { url: testUrl } },
});

describe("markets", () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.ledgerEntry.deleteMany();
    await prisma.marketBlacklist.deleteMany();
    await prisma.order.deleteMany();
    await prisma.position.deleteMany();
    await prisma.trade.deleteMany();
    await prisma.market.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("creates an open binary market with a future close time", async () => {
    const creator = await prisma.user.create({
      data: { name: "Creator", email: "creator@test.dev" },
    });

    const market = await createMarket(prisma, {
      actorUserId: creator.id,
      question: "Will dinner happen?",
      description: "Friend group dinner",
      resolutionCriteria: "Resolves YES if dinner happens before midnight.",
      closeTime: new Date(Date.now() + 86_400_000),
    });

    expect(market.status).toBe("OPEN");
    expect(market.question).toBe("Will dinner happen?");
    expect(market.creatorId).toBe(creator.id);
    await expect(
      prisma.auditLog.findFirstOrThrow({ where: { action: "MARKET_CREATED" } }),
    ).resolves.toMatchObject({
      entityType: "Market",
      entityId: market.id,
      actorUserId: creator.id,
    });
  });

  it("blacklisting cancels the user's open orders and releases locked cash and shares", async () => {
    const actor = await prisma.user.create({
      data: { name: "Actor", email: "actor@test.dev" },
    });
    const user = await prisma.user.create({
      data: {
        name: "User",
        email: "user@test.dev",
        availableCents: 800,
        lockedCents: 200,
      },
    });
    const market = await createMarket(prisma, {
      actorUserId: actor.id,
      question: "Will it rain?",
      description: "Weather",
      resolutionCriteria: "YES if it rains.",
      closeTime: new Date(Date.now() + 86_400_000),
    });
    const position = await prisma.position.create({
      data: {
        userId: user.id,
        marketId: market.id,
        outcome: "NO",
        availableQuantity: 2,
        lockedQuantity: 3,
      },
    });
    const buyOrder = await prisma.order.create({
      data: {
        userId: user.id,
        marketId: market.id,
        outcome: "YES",
        action: "BUY",
        limitPriceCents: 40,
        originalQuantity: 5,
        remainingQuantity: 5,
        lockedCents: 200,
        status: "OPEN",
      },
    });
    const sellOrder = await prisma.order.create({
      data: {
        userId: user.id,
        marketId: market.id,
        outcome: "NO",
        action: "SELL",
        limitPriceCents: 60,
        originalQuantity: 5,
        remainingQuantity: 3,
        lockedQuantity: 3,
        status: "PARTIALLY_FILLED",
      },
    });

    await addUserToMarketBlacklist(prisma, {
      actorUserId: actor.id,
      marketId: market.id,
      userId: user.id,
      note: "controls outcome",
    });

    const orders = await prisma.order.findMany({
      where: { id: { in: [buyOrder.id, sellOrder.id] } },
      orderBy: { createdAt: "asc" },
    });
    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const updatedPosition = await prisma.position.findUniqueOrThrow({
      where: { id: position.id },
    });
    const blacklistEntry = await prisma.marketBlacklist.findUniqueOrThrow({
      where: { marketId_userId: { marketId: market.id, userId: user.id } },
    });
    const auditEntries = await prisma.auditLog.findMany();

    expect(orders.map((order) => order.status)).toEqual(["CANCELLED", "CANCELLED"]);
    expect(orders.map((order) => order.lockedCents)).toEqual([0, 0]);
    expect(orders.map((order) => order.lockedQuantity)).toEqual([0, 0]);
    expect(updatedUser.lockedCents).toBe(0);
    expect(updatedUser.availableCents).toBe(1000);
    expect(updatedPosition.lockedQuantity).toBe(0);
    expect(updatedPosition.availableQuantity).toBe(5);
    expect(blacklistEntry.note).toBe("controls outcome");
    expect(auditEntries.map((entry) => entry.action).sort()).toEqual([
      "MARKET_CREATED",
      "MARKET_USER_BLACKLISTED",
    ]);
  });

  it("closes expired open markets and cancels resting orders", async () => {
    const actor = await prisma.user.create({
      data: { name: "Actor", email: "actor-close@test.dev", availableCents: 700, lockedCents: 300 },
    });
    const market = await prisma.market.create({
      data: {
        creatorId: actor.id,
        question: "Expired?",
        description: "Past close",
        resolutionCriteria: "Close when expired.",
        closeTime: new Date("2026-05-18T12:00:00.000Z"),
        status: "OPEN",
      },
    });
    await prisma.order.create({
      data: {
        userId: actor.id,
        marketId: market.id,
        outcome: "YES",
        action: "BUY",
        limitPriceCents: 30,
        originalQuantity: 10,
        remainingQuantity: 10,
        lockedCents: 300,
        status: "OPEN",
      },
    });

    const closed = await closeExpiredMarkets(prisma, new Date("2026-05-19T12:00:00.000Z"));

    const updatedMarket = await prisma.market.findUniqueOrThrow({ where: { id: market.id } });
    const updatedOrder = await prisma.order.findFirstOrThrow({ where: { marketId: market.id } });
    const updatedActor = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    const auditEntry = await prisma.auditLog.findFirstOrThrow();

    expect(closed).toHaveLength(1);
    expect(updatedMarket.status).toBe("CLOSED");
    expect(updatedOrder.status).toBe("CANCELLED");
    expect(updatedActor.availableCents).toBe(1000);
    expect(updatedActor.lockedCents).toBe(0);
    expect(auditEntry.action).toBe("MARKET_CLOSED");
  });

  it("blacklisted active users can still resolve the market", async () => {
    const actor = await prisma.user.create({
      data: { name: "Actor", email: "actor2@test.dev" },
    });
    const user = await prisma.user.create({
      data: { name: "User", email: "user2@test.dev" },
    });
    const market = await createMarket(prisma, {
      actorUserId: actor.id,
      question: "Will the host arrive?",
      description: "Host-controlled event",
      resolutionCriteria: "YES if host arrives.",
      closeTime: new Date(Date.now() + 86_400_000),
    });
    await addUserToMarketBlacklist(prisma, {
      actorUserId: actor.id,
      marketId: market.id,
      userId: user.id,
      note: "host controls outcome",
    });

    const resolved = await resolveMarket(prisma, {
      actorUserId: user.id,
      marketId: market.id,
      resolution: "YES",
      note: "I arrived",
    });

    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.resolution).toBe("YES");
    expect(resolved.resolutionNote).toBe("I arrived");
    expect(resolved.resolvedById).toBe(user.id);
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
  });
});
