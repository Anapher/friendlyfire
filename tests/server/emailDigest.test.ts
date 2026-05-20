import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { EmailAdapter, EmailMessage } from "@/server/emailAdapter";
import { sendActiveMarketDigests } from "@/server/emailDigest";
import { createIsolatedPrisma, resetTestDb } from "./helpers";

const { prisma, cleanup } = createIsolatedPrisma("email-digest");

class FakeEmailAdapter implements EmailAdapter {
  messages: EmailMessage[] = [];

  constructor(private readonly failingRecipients = new Set<string>()) {}

  async send(message: EmailMessage) {
    if (this.failingRecipients.has(message.to)) {
      throw new Error(`Could not send to ${message.to}`);
    }

    this.messages.push(message);
  }
}

describe("sendActiveMarketDigests", () => {
  beforeEach(async () => {
    await resetTestDb(prisma);
  });

  afterAll(async () => {
    await cleanup();
  });

  it("sends active opted-in users a digest containing open markets and audits the send", async () => {
    const email = new FakeEmailAdapter();
    const creator = await prisma.user.create({
      data: { name: "Creator", email: "creator@test.dev" },
    });
    const activeRecipient = await prisma.user.create({
      data: { name: "Active User", email: "active@test.dev" },
    });
    await prisma.user.create({
      data: { name: "Inactive User", email: "inactive@test.dev", status: "INACTIVE" },
    });
    await prisma.user.create({
      data: { name: "Opted Out User", email: "opted-out@test.dev", digestOptOut: true },
    });
    await prisma.user.create({
      data: { name: "No Email User", email: "" },
    });
    const laterOpenMarket = await prisma.market.create({
      data: {
        creatorId: creator.id,
        question: "Will the picnic happen?",
        resolutionCriteria: "YES if the picnic happens.",
        closeTime: new Date("2026-06-01T12:00:00.000Z"),
        status: "OPEN",
      },
    });
    const earlierOpenMarket = await prisma.market.create({
      data: {
        creatorId: creator.id,
        question: "Will brunch happen?",
        resolutionCriteria: "YES if brunch happens.",
        closeTime: new Date("2026-05-30T12:00:00.000Z"),
        status: "OPEN",
      },
    });
    await prisma.market.create({
      data: {
        creatorId: creator.id,
        question: "Will the old market appear?",
        resolutionCriteria: "YES if it appears.",
        closeTime: new Date("2026-05-20T12:00:00.000Z"),
        status: "CLOSED",
      },
    });

    const result = await sendActiveMarketDigests(prisma, email);

    expect(result).toEqual({ recipientCount: 2, marketCount: 2 });
    expect(email.messages.map((message) => message.to)).toEqual([
      "creator@test.dev",
      "active@test.dev",
    ]);
    expect(email.messages[0].text).toContain(earlierOpenMarket.question);
    expect(email.messages[0].text).toContain(earlierOpenMarket.closeTime.toISOString());
    expect(email.messages[0].text.indexOf(earlierOpenMarket.question)).toBeLessThan(
      email.messages[0].text.indexOf(laterOpenMarket.question),
    );
    expect(email.messages[0].text).not.toContain("Will the old market appear?");

    const auditEntries = await prisma.auditLog.findMany({
      where: { action: "EMAIL_DIGEST_SENT" },
      orderBy: { createdAt: "asc" },
    });

    expect(auditEntries).toHaveLength(2);
    expect(auditEntries.map((entry) => entry.entityId)).toEqual([creator.id, activeRecipient.id]);
    expect(auditEntries.map((entry) => JSON.parse(entry.metadataJson).marketCount)).toEqual([2, 2]);
  });

  it("continues sending later digests after a recipient send failure and audits both outcomes", async () => {
    const email = new FakeEmailAdapter(new Set(["first@test.dev"]));
    const creator = await prisma.user.create({
      data: { name: "Creator", email: "creator@test.dev" },
    });
    const firstRecipient = await prisma.user.create({
      data: { name: "First User", email: "first@test.dev" },
    });
    const laterRecipient = await prisma.user.create({
      data: { name: "Later User", email: "later@test.dev" },
    });
    await prisma.market.create({
      data: {
        creatorId: creator.id,
        question: "Will the digest survive a send failure?",
        resolutionCriteria: "YES if later users still receive mail.",
        closeTime: new Date("2026-06-01T12:00:00.000Z"),
        status: "OPEN",
      },
    });

    const result = await sendActiveMarketDigests(prisma, email);

    expect(result).toEqual({ recipientCount: 3, marketCount: 1 });
    expect(email.messages.map((message) => message.to)).toEqual([
      "creator@test.dev",
      "later@test.dev",
    ]);

    const auditEntries = await prisma.auditLog.findMany({
      orderBy: { createdAt: "asc" },
    });
    const failedAudit = auditEntries.find((entry) => entry.action === "EMAIL_DIGEST_FAILED");
    const sentAudits = auditEntries.filter((entry) => entry.action === "EMAIL_DIGEST_SENT");

    expect(failedAudit?.entityId).toBe(firstRecipient.id);
    expect(JSON.parse(failedAudit?.metadataJson ?? "{}")).toMatchObject({
      recipientEmail: "first@test.dev",
      marketCount: 1,
      errorMessage: "Could not send to first@test.dev",
    });
    expect(sentAudits.map((entry) => entry.entityId)).toEqual([creator.id, laterRecipient.id]);
  });
});
