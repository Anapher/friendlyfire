import type { Prisma, PrismaClient } from "@prisma/client";

type AuditPrisma = PrismaClient | Prisma.TransactionClient;

export async function audit(
  prisma: AuditPrisma,
  input: {
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  return prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadataJson: JSON.stringify(input.metadata ?? {}),
    },
  });
}
