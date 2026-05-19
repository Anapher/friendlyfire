import type { PrismaClient, User } from "@prisma/client";
import { randomUUID } from "node:crypto";
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

    const type = input.amountCents >= 0 ? "ADMIN_CREDIT" : "ADMIN_DEBIT";
    const operationId = randomUUID();
    await tx.user.findUniqueOrThrow({ where: { id: input.targetUserId } });
    let balanceBeforeCents: number;
    let updated: User;

    if (input.amountCents >= 0) {
      updated = await tx.user.update({
        where: { id: input.targetUserId },
        data: { availableCents: { increment: input.amountCents } },
      });
      balanceBeforeCents = updated.availableCents - input.amountCents;
    } else {
      const debitAmount = Math.abs(input.amountCents);
      const debit = await tx.user.updateMany({
        where: {
          id: input.targetUserId,
          availableCents: { gte: debitAmount },
        },
        data: { availableCents: { decrement: debitAmount } },
      });

      if (debit.count !== 1) {
        throw domainError(
          "INSUFFICIENT_BALANCE",
          "Adjustment would make available balance negative",
        );
      }

      updated = await tx.user.findUniqueOrThrow({ where: { id: input.targetUserId } });
      balanceBeforeCents = updated.availableCents + debitAmount;
    }

    const balanceAfterCents = updated.availableCents;

    const ledgerEntry = await tx.ledgerEntry.create({
      data: {
        userId: input.targetUserId,
        type,
        amountCents: input.amountCents,
        metadataJson: JSON.stringify({
          operationId,
          note: input.note,
          actorUserId: input.actorUserId,
          targetUserId: input.targetUserId,
          balanceBeforeCents,
          balanceAfterCents,
        }),
      },
    });

    await audit(tx, {
      actorUserId: input.actorUserId,
      action: type,
      entityType: "User",
      entityId: input.targetUserId,
      metadata: {
        operationId,
        ledgerEntryId: ledgerEntry.id,
        amountCents: input.amountCents,
        note: input.note,
        actorUserId: input.actorUserId,
        targetUserId: input.targetUserId,
        balanceBeforeCents,
        balanceAfterCents,
      },
    });

    return updated;
  });
}
