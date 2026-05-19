import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adjustUserBalance } from "@/server/ledger";

const testDir = mkdtempSync(join(tmpdir(), "friendlyfire-ledger-"));
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

describe("adjustUserBalance", () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.ledgerEntry.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("lets admins credit and debit users with audit entries", async () => {
    const admin = await prisma.user.create({
      data: { name: "Admin", email: "admin@test.dev", role: "ADMIN" },
    });
    const user = await prisma.user.create({
      data: { name: "User", email: "user@test.dev", availableCents: 1000 },
    });

    await adjustUserBalance(prisma, {
      actorUserId: admin.id,
      targetUserId: user.id,
      amountCents: 250,
      note: "deposit",
    });
    await adjustUserBalance(prisma, {
      actorUserId: admin.id,
      targetUserId: user.id,
      amountCents: -100,
      note: "withdraw",
    });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      orderBy: { createdAt: "asc" },
    });
    const auditEntries = await prisma.auditLog.findMany();

    expect(updated.availableCents).toBe(1150);
    expect(ledgerEntries.map((entry) => entry.amountCents)).toEqual([250, -100]);
    expect(auditEntries).toHaveLength(2);
  });

  it("rejects debits beyond available balance without changing the balance", async () => {
    const admin = await prisma.user.create({
      data: { name: "Admin", email: "admin@test.dev", role: "ADMIN" },
    });
    const user = await prisma.user.create({
      data: { name: "User", email: "user@test.dev", availableCents: 75 },
    });

    await expect(
      adjustUserBalance(prisma, {
        actorUserId: admin.id,
        targetUserId: user.id,
        amountCents: -100,
        note: "too much",
      }),
    ).rejects.toThrow("Adjustment would make available balance negative");

    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const ledgerEntries = await prisma.ledgerEntry.findMany();
    const auditEntries = await prisma.auditLog.findMany();

    expect(unchanged.availableCents).toBe(75);
    expect(ledgerEntries).toHaveLength(0);
    expect(auditEntries).toHaveLength(0);
  });

  it("records shared operation metadata for reconciliation", async () => {
    const admin = await prisma.user.create({
      data: { name: "Admin", email: "admin@test.dev", role: "ADMIN" },
    });
    const user = await prisma.user.create({
      data: { name: "User", email: "user@test.dev", availableCents: 100 },
    });

    await adjustUserBalance(prisma, {
      actorUserId: admin.id,
      targetUserId: user.id,
      amountCents: 50,
      note: "reconcile",
    });

    const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow();
    const auditEntry = await prisma.auditLog.findFirstOrThrow();
    const ledgerMetadata = JSON.parse(ledgerEntry.metadataJson);
    const auditMetadata = JSON.parse(auditEntry.metadataJson);

    expect(ledgerMetadata).toMatchObject({
      note: "reconcile",
      actorUserId: admin.id,
      targetUserId: user.id,
      balanceBeforeCents: 100,
      balanceAfterCents: 150,
    });
    expect(auditMetadata).toMatchObject({
      ledgerEntryId: ledgerEntry.id,
      amountCents: 50,
      note: "reconcile",
      actorUserId: admin.id,
      targetUserId: user.id,
      balanceBeforeCents: 100,
      balanceAfterCents: 150,
    });
    expect(auditMetadata.operationId).toBe(ledgerMetadata.operationId);
    expect(typeof ledgerMetadata.operationId).toBe("string");
  });

  it("rejects non-admin adjustments", async () => {
    const actor = await prisma.user.create({
      data: { name: "Actor", email: "actor@test.dev" },
    });
    const user = await prisma.user.create({
      data: { name: "User", email: "user@test.dev" },
    });

    await expect(
      adjustUserBalance(prisma, {
        actorUserId: actor.id,
        targetUserId: user.id,
        amountCents: 100,
        note: "nope",
      }),
    ).rejects.toThrow("Only admins can adjust balances");
  });
});
