import { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { adjustUserBalance } from "@/server/ledger";

const prisma = new PrismaClient();

describe("adjustUserBalance", () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.ledgerEntry.deleteMany();
    await prisma.user.deleteMany();
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
