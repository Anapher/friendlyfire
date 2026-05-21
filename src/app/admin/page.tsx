import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import type { UserRole, UserStatus } from "@/domain/types";
import { PageHeader } from "../_ui/PageHeader";
import { NewUserDrawer } from "./NewUserDrawer";
import { UsersTable } from "./UsersTable";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const currentUser = await requireCurrentUser();
  if (currentUser.role !== "ADMIN") {
    redirect("/");
  }
  const users = await db.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] });

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-3 py-4 md:px-6 md:py-6">
      <PageHeader
        back="/"
        title="Admin"
        subtitle="Users and balance adjustments"
        rightSlot={<NewUserDrawer />}
      />

      <UsersTable
        users={users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as UserRole,
          status: user.status as UserStatus,
          availableCents: user.availableCents,
          lockedCents: user.lockedCents,
          digestOptOut: user.digestOptOut,
          createdAt: user.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
