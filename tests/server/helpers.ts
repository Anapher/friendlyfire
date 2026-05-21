import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

export function createIsolatedPrisma(prefix: string) {
  const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!baseUrl?.startsWith("postgres")) {
    throw new Error("Server tests require TEST_DATABASE_URL or DATABASE_URL to point at Postgres");
  }

  const schema = `test_${prefix}_${randomUUID().replaceAll("-", "_")}`;
  const testUrl = withSchema(baseUrl, schema);
  const directTestUrl = withSchema(process.env.TEST_DIRECT_URL ?? process.env.DIRECT_URL ?? baseUrl, schema);

  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: testUrl, DIRECT_URL: directTestUrl },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({
    datasources: { db: { url: testUrl } },
  });

  return {
    prisma,
    async cleanup() {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await prisma.$disconnect();
    },
  };
}

function withSchema(databaseUrl: string, schema: string) {
  const url = new URL(databaseUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

export async function resetTestDb(prisma: PrismaClient) {
  await prisma.session.deleteMany();
  await prisma.magicLoginToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.marketBlacklist.deleteMany();
  await prisma.order.deleteMany();
  await prisma.trade.deleteMany();
  await prisma.position.deleteMany();
  await prisma.market.deleteMany();
  await prisma.user.deleteMany();
}
