import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "@/server/users";
import { createIsolatedPrisma, resetTestDb } from "./helpers";

const db = createIsolatedPrisma("users");
const prisma = db.prisma;

describe("createUser", () => {
  beforeEach(async () => {
    await resetTestDb(prisma);
  });

  afterAll(async () => {
    await db.cleanup();
  });

  it("lets admins create active users with starting balance and audit trail", async () => {
    const admin = await prisma.user.create({
      data: { name: "Admin", email: "admin@test.dev", role: "ADMIN" },
    });

    const user = await createUser(prisma, {
      actorUserId: admin.id,
      name: " New Friend ",
      email: "FRIEND@Test.dev ",
      role: "USER",
      startingBalanceCents: 2500,
      digestOptOut: false,
    });

    const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow();
    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: "USER_CREATED" },
    });
    const ledgerMetadata = JSON.parse(ledgerEntry.metadataJson);
    const auditMetadata = JSON.parse(auditEntry.metadataJson);

    expect(user).toMatchObject({
      name: "New Friend",
      email: "friend@test.dev",
      role: "USER",
      status: "ACTIVE",
      availableCents: 2500,
      lockedCents: 0,
      digestOptOut: false,
    });
    expect(ledgerEntry).toMatchObject({
      userId: user.id,
      type: "ADMIN_CREDIT",
      amountCents: 2500,
    });
    expect(ledgerMetadata).toMatchObject({
      actorUserId: admin.id,
      targetUserId: user.id,
      balanceBeforeCents: 0,
      balanceAfterCents: 2500,
    });
    expect(auditEntry).toMatchObject({
      actorUserId: admin.id,
      entityType: "User",
      entityId: user.id,
    });
    expect(auditMetadata.operationId).toBe(ledgerMetadata.operationId);
    expect(auditMetadata.ledgerEntryId).toBe(ledgerEntry.id);
  });

  it("lets admins create admin users without a starting-balance ledger entry", async () => {
    const admin = await prisma.user.create({
      data: { name: "Admin", email: "admin@test.dev", role: "ADMIN" },
    });

    const user = await createUser(prisma, {
      actorUserId: admin.id,
      name: "Second Admin",
      email: "second-admin@test.dev",
      role: "ADMIN",
      startingBalanceCents: 0,
      digestOptOut: true,
    });

    await expect(prisma.ledgerEntry.count()).resolves.toBe(0);
    await expect(prisma.auditLog.count()).resolves.toBe(1);
    expect(user.role).toBe("ADMIN");
    expect(user.digestOptOut).toBe(true);
  });

  it("rejects non-admin user creation", async () => {
    const actor = await prisma.user.create({
      data: { name: "Actor", email: "actor@test.dev", role: "USER" },
    });

    await expect(
      createUser(prisma, {
        actorUserId: actor.id,
        name: "Friend",
        email: "friend@test.dev",
        role: "USER",
        startingBalanceCents: 0,
        digestOptOut: false,
      }),
    ).rejects.toThrow("Only admins can create users");

    await expect(prisma.user.count()).resolves.toBe(1);
  });

  it("rejects invalid user fields", async () => {
    const admin = await prisma.user.create({
      data: { name: "Admin", email: "admin@test.dev", role: "ADMIN" },
    });

    await expect(
      createUser(prisma, {
        actorUserId: admin.id,
        name: "",
        email: "friend@test.dev",
        role: "USER",
        startingBalanceCents: 0,
        digestOptOut: false,
      }),
    ).rejects.toThrow("User name is required");

    await expect(
      createUser(prisma, {
        actorUserId: admin.id,
        name: "Friend",
        email: "not-an-email",
        role: "USER",
        startingBalanceCents: 0,
        digestOptOut: false,
      }),
    ).rejects.toThrow("A valid email address is required");

    await expect(
      createUser(prisma, {
        actorUserId: admin.id,
        name: "Friend",
        email: "friend@test.dev",
        role: "USER",
        startingBalanceCents: -1,
        digestOptOut: false,
      }),
    ).rejects.toThrow("Starting balance must be a non-negative integer");
  });
});
