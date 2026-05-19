import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {
      name: "Admin",
      role: "ADMIN",
      status: "ACTIVE",
      availableCents: 10000,
      lockedCents: 0,
      digestOptOut: false,
    },
    create: {
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
      availableCents: 10000,
    },
  });

  await prisma.user.upsert({
    where: { email: "friend@example.com" },
    update: {
      name: "Friend",
      role: "USER",
      status: "ACTIVE",
      availableCents: 10000,
      lockedCents: 0,
      digestOptOut: false,
    },
    create: {
      name: "Friend",
      email: "friend@example.com",
      role: "USER",
      availableCents: 10000,
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    throw error;
  });
