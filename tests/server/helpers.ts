import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createIsolatedPrisma(prefix: string) {
  const testDir = mkdtempSync(join(tmpdir(), `friendlyfire-${prefix}-`));
  const testDbPath = join(testDir, "test.db");
  const testUrl = `file:${testDbPath}`;

  closeSync(openSync(testDbPath, "w"));

  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({
    datasources: { db: { url: testUrl } },
  });

  return {
    prisma,
    async cleanup() {
      await prisma.$disconnect();
      rmSync(testDir, { recursive: true, force: true });
    },
  };
}

export async function resetTestDb(prisma: PrismaClient) {
  await prisma.auditLog.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.marketBlacklist.deleteMany();
  await prisma.order.deleteMany();
  await prisma.trade.deleteMany();
  await prisma.position.deleteMany();
  await prisma.market.deleteMany();
  await prisma.user.deleteMany();
}
