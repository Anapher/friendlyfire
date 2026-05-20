import Link from "next/link";
import { redirect } from "next/navigation";
import { adjustBalanceAction, createUserAction, logoutAction } from "../actions";
import { requireCurrentUser } from "@/server/auth";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function AdminPage() {
  const currentUser = await requireCurrentUser();
  if (currentUser.role !== "ADMIN") {
    redirect("/");
  }
  const users = await db.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] });

  return (
    <main>
      <header className="page-header">
        <div>
          <Link href="/">FriendlyFire</Link>
          <h1>Admin</h1>
          <p>Users and balance adjustments</p>
        </div>
        <nav>
          <span className="signed-in">Signed in as {currentUser.name}</span>
          <form action={logoutAction}>
            <button type="submit">Logout</button>
          </form>
        </nav>
      </header>

      <section>
        <h2>Users</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Available</th>
              <th>Locked</th>
              <th>Digest</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>{user.status}</td>
                <td>{money(user.availableCents)}</td>
                <td>{money(user.lockedCents)}</td>
                <td>{user.digestOptOut ? "Opted out" : "Enabled"}</td>
                <td>{user.createdAt.toLocaleString()}</td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td colSpan={8}>No users. Run the seed script to create local users.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Create User</h2>
        <form action={createUserAction} className="form-grid compact-form">
          <label>
            Name
            <input name="name" required placeholder="New Friend" />
          </label>
          <label>
            Email
            <input name="email" type="email" required placeholder="friend@example.com" />
          </label>
          <label>
            Role
            <select name="role" defaultValue="USER" required>
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>
          <label>
            Starting Balance Cents
            <input name="startingBalanceCents" type="number" min={0} step={1} defaultValue={0} required />
          </label>
          <label className="checkbox-label">
            <input name="digestOptOut" type="checkbox" />
            Digest opt-out
          </label>
          <button type="submit">Create User</button>
        </form>
      </section>

      <section>
        <h2>Adjust Balance</h2>
        <form action={adjustBalanceAction} className="form-grid compact-form">
          <label>
            Target User
            <select name="targetUserId" required>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount Cents
            <input name="amountCents" type="number" step={1} defaultValue={1000} required />
          </label>
          <label className="span-2">
            Note
            <input name="note" required placeholder="Local adjustment" />
          </label>
          <button type="submit">Adjust</button>
        </form>
      </section>
    </main>
  );
}
