import type { PrismaClient } from "@prisma/client";
import { domainError } from "@/domain/errors";
import { audit } from "./audit";

export async function adjustUserBalance(
  prisma: PrismaClient,
  input: {
    actorUserId: string;
    targetUserId: string;
    amountCents: number;
    note: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUniqueOrThrow({ where: { id: input.actorUserId } });
    if (actor.role !== "ADMIN") {
      throw domainError("UNAUTHORIZED_ADMIN_ACTION", "Only admins can adjust balances");
    }

    const target = await tx.user.findUniqueOrThrow({ where: { id: input.targetUserId } });
    if (target.availableCents + input.amountCents < 0) {
      throw domainError(
        "INSUFFICIENT_BALANCE",
        "Adjustment would make available balance negative",
      );
    }

    const type = input.amountCents >= 0 ? "ADMIN_CREDIT" : "ADMIN_DEBIT";
    const updated = await tx.user.update({
      where: { id: input.targetUserId },
      data: { availableCents: { increment: input.amountCents } },
    });

    await tx.ledgerEntry.create({
      data: {
        userId: input.targetUserId,
        type,
        amountCents: input.amountCents,
        metadataJson: JSON.stringify({
          note: input.note,
          actorUserId: input.actorUserId,
        }),
      },
    });

    await audit(tx, {
      actorUserId: input.actorUserId,
      action: type,
      entityType: "User",
      entityId: input.targetUserId,
      metadata: {
        amountCents: input.amountCents,
        note: input.note,
      },
    });

    return updated;
  });
}
