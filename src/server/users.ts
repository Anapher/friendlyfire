import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { domainError } from "@/domain/errors";
import type { UserRole } from "@/domain/types";
import { audit } from "./audit";

export async function createUser(
  prisma: PrismaClient,
  input: {
    actorUserId: string;
    name: string;
    email: string;
    role: UserRole;
    startingBalanceCents: number;
    digestOptOut: boolean;
  },
) {
  return prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUniqueOrThrow({ where: { id: input.actorUserId } });
    if (actor.role !== "ADMIN") {
      throw domainError("UNAUTHORIZED_ADMIN_ACTION", "Only admins can create users");
    }

    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (!name) {
      throw domainError("INVALID_USER_NAME", "User name is required");
    }
    if (!email || !email.includes("@")) {
      throw domainError("INVALID_USER_EMAIL", "A valid email address is required");
    }
    if (input.role !== "USER" && input.role !== "ADMIN") {
      throw domainError("INVALID_USER_ROLE", "User role must be USER or ADMIN");
    }
    if (!Number.isInteger(input.startingBalanceCents) || input.startingBalanceCents < 0) {
      throw domainError(
        "INVALID_STARTING_BALANCE",
        "Starting balance must be a non-negative integer",
      );
    }

    const operationId = randomUUID();
    const user = await tx.user.create({
      data: {
        name,
        email,
        role: input.role,
        status: "ACTIVE",
        availableCents: input.startingBalanceCents,
        digestOptOut: input.digestOptOut,
      },
    });

    let ledgerEntryId: string | undefined;
    if (input.startingBalanceCents > 0) {
      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          userId: user.id,
          type: "ADMIN_CREDIT",
          amountCents: input.startingBalanceCents,
          metadataJson: JSON.stringify({
            operationId,
            note: "Initial user balance",
            actorUserId: input.actorUserId,
            targetUserId: user.id,
            balanceBeforeCents: 0,
            balanceAfterCents: input.startingBalanceCents,
          }),
        },
      });
      ledgerEntryId = ledgerEntry.id;
    }

    await audit(tx, {
      actorUserId: input.actorUserId,
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      metadata: {
        operationId,
        ledgerEntryId,
        createdUserId: user.id,
        email,
        role: input.role,
        startingBalanceCents: input.startingBalanceCents,
        digestOptOut: input.digestOptOut,
      },
    });

    return user;
  });
}
