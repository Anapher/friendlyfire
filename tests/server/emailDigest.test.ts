import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { EmailAdapter, EmailMessage } from "@/server/emailAdapter";
import { sendActiveMarketDigests } from "@/server/emailDigest";
import { createIsolatedPrisma, resetTestDb } from "./helpers";

const { prisma, cleanup } = createIsolatedPrisma("email-digest");

class FakeEmailAdapter implements EmailAdapter {
  messages: EmailMessage[] = [];

  async send(message: EmailMessage) {
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
        description: "Weekend plans",
        resolutionCriteria: "YES if the picnic happens.",
        closeTime: new Date("2026-06-01T12:00:00.000Z"),
        status: "OPEN",
      },
    });
    const earlierOpenMarket = await prisma.market.create({
      data: {
        creatorId: creator.id,
        question: "Will brunch happen?",
        description: "Morning plans",
        resolutionCriteria: "YES if brunch happens.",
        closeTime: new Date("2026-05-30T12:00:00.000Z"),
        status: "OPEN",
      },
    });
    await prisma.market.create({
      data: {
        creatorId: creator.id,
        question: "Will the old market appear?",
        description: "Closed market",
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
});
