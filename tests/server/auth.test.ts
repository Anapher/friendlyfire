import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { EmailAdapter, EmailMessage } from "@/server/emailAdapter";
import {
  consumeMagicLink,
  getSessionUserByToken,
  requestMagicLink,
} from "@/server/auth";
import { createIsolatedPrisma, resetTestDb } from "./helpers";

const db = createIsolatedPrisma("auth");
const prisma = db.prisma;

function captureEmailAdapter() {
  const messages: EmailMessage[] = [];
  const adapter: EmailAdapter = {
    async send(message) {
      messages.push(message);
    },
  };

  return { adapter, messages };
}

function magicTokenFromMessage(message: EmailMessage) {
  const match = message.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match) {
    throw new Error(`Expected magic token in message text: ${message.text}`);
  }
  return match[1];
}

describe("magic link auth", () => {
  beforeEach(async () => {
    await resetTestDb(prisma);
  });

  afterAll(async () => {
    await db.cleanup();
  });

  it("sends a magic link to an existing active user without storing the raw token", async () => {
    const user = await prisma.user.create({
      data: { name: "Active User", email: "active@test.dev", status: "ACTIVE" },
    });
    const { adapter, messages } = captureEmailAdapter();

    await requestMagicLink(prisma, " ACTIVE@test.dev ", adapter, "https://app.test");

    const tokenRow = await prisma.magicLoginToken.findFirstOrThrow({
      where: { userId: user.id },
    });
    const token = magicTokenFromMessage(messages[0]);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      to: "active@test.dev",
      subject: "Your FriendlyFire login link",
    });
    expect(messages[0].text).toContain("https://app.test/auth/magic?token=");
    expect(tokenRow.tokenHash).not.toBe(token);
    expect(tokenRow.expiresAt.getTime()).toBeGreaterThan(Date.now());
    await expect(
      prisma.auditLog.findFirstOrThrow({ where: { action: "MAGIC_LINK_REQUESTED" } }),
    ).resolves.toMatchObject({
      actorUserId: user.id,
      entityType: "User",
      entityId: user.id,
    });
  });

  it("does not create tokens or send email for unknown or inactive users", async () => {
    await prisma.user.create({
      data: { name: "Inactive User", email: "inactive@test.dev", status: "INACTIVE" },
    });
    const { adapter, messages } = captureEmailAdapter();

    await requestMagicLink(prisma, "unknown@test.dev", adapter, "https://app.test");
    await requestMagicLink(prisma, "inactive@test.dev", adapter, "https://app.test");

    expect(messages).toHaveLength(0);
    await expect(prisma.magicLoginToken.count()).resolves.toBe(0);
  });

  it("consumes a valid magic link once and creates a session for the active user", async () => {
    const user = await prisma.user.create({
      data: { name: "Active User", email: "active@test.dev", status: "ACTIVE" },
    });
    const { adapter, messages } = captureEmailAdapter();
    await requestMagicLink(prisma, user.email, adapter, "https://app.test");
    const magicToken = magicTokenFromMessage(messages[0]);

    const result = await consumeMagicLink(prisma, magicToken);

    const consumedToken = await prisma.magicLoginToken.findFirstOrThrow({
      where: { userId: user.id },
    });
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    const sessionUser = await getSessionUserByToken(prisma, result.sessionToken);

    expect(result.user.id).toBe(user.id);
    expect(result.sessionToken).not.toBe(session.tokenHash);
    expect(result.session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(consumedToken.consumedAt).toBeInstanceOf(Date);
    expect(sessionUser?.id).toBe(user.id);
    await expect(consumeMagicLink(prisma, magicToken)).rejects.toThrow(
      "Magic link is invalid or expired",
    );
  });

  it("rejects expired magic links without creating a session", async () => {
    const user = await prisma.user.create({
      data: { name: "Active User", email: "active-expired@test.dev", status: "ACTIVE" },
    });
    const { adapter, messages } = captureEmailAdapter();
    await requestMagicLink(prisma, user.email, adapter, "https://app.test");
    const magicToken = magicTokenFromMessage(messages[0]);
    await prisma.magicLoginToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await expect(consumeMagicLink(prisma, magicToken)).rejects.toThrow(
      "Magic link is invalid or expired",
    );
    await expect(prisma.session.count()).resolves.toBe(0);
  });

  it("does not return users for expired sessions", async () => {
    const user = await prisma.user.create({
      data: { name: "Active User", email: "session-expired@test.dev", status: "ACTIVE" },
    });
    const { adapter, messages } = captureEmailAdapter();
    await requestMagicLink(prisma, user.email, adapter, "https://app.test");
    const { sessionToken } = await consumeMagicLink(prisma, magicTokenFromMessage(messages[0]));
    await prisma.session.updateMany({
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await expect(getSessionUserByToken(prisma, sessionToken)).resolves.toBeNull();
  });
});
