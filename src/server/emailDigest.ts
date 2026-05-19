import type { Prisma, PrismaClient } from "@prisma/client";
import { audit } from "./audit";
import type { EmailAdapter } from "./emailAdapter";

type DigestPrisma = PrismaClient | Prisma.TransactionClient;

export async function sendActiveMarketDigests(prisma: DigestPrisma, email: EmailAdapter) {
  const [recipients, markets] = await Promise.all([
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        digestOptOut: false,
        email: { not: "" },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.market.findMany({
      where: { status: "OPEN" },
      orderBy: { closeTime: "asc" },
    }),
  ]);

  const subject = `FriendlyFire active markets (${markets.length})`;
  const text = buildDigestText(markets);

  for (const recipient of recipients) {
    try {
      await email.send({
        to: recipient.email,
        subject,
        text,
      });

      await audit(prisma, {
        action: "EMAIL_DIGEST_SENT",
        entityType: "User",
        entityId: recipient.id,
        metadata: {
          recipientUserId: recipient.id,
          marketCount: markets.length,
          marketIds: markets.map((market) => market.id),
        },
      });
    } catch (error) {
      await audit(prisma, {
        action: "EMAIL_DIGEST_FAILED",
        entityType: "User",
        entityId: recipient.id,
        metadata: {
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          marketCount: markets.length,
          marketIds: markets.map((market) => market.id),
          errorMessage: errorMessage(error),
        },
      });
    }
  }

  return {
    recipientCount: recipients.length,
    marketCount: markets.length,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function buildDigestText(
  markets: Array<{
    question: string;
    closeTime: Date;
  }>,
) {
  if (markets.length === 0) {
    return "No markets are currently open.";
  }

  return [
    "Open markets:",
    "",
    ...markets.map((market) => `- ${market.question} (closes ${market.closeTime.toISOString()})`),
  ].join("\n");
}
