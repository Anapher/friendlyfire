import Link from "next/link";
import { createMarketAction } from "./actions";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function dateTimeInputValue(date: Date) {
  return date.toISOString().slice(0, 16);
}

export default async function HomePage() {
  const [markets, users] = await Promise.all([
    db.market.findMany({
      where: { status: "OPEN" },
      include: { creator: true },
      orderBy: { closeTime: "asc" },
    }),
    db.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] }),
  ]);
  const defaultCloseTime = dateTimeInputValue(new Date(Date.now() + 86_400_000));

  return (
    <main>
      <header className="page-header">
        <div>
          <h1>FriendlyFire</h1>
          <p>Local private prediction markets</p>
        </div>
        <nav>
          <Link href="/admin">Admin</Link>
        </nav>
      </header>

      <section>
        <h2>Open Markets</h2>
        <table>
          <thead>
            <tr>
              <th>Question</th>
              <th>Creator</th>
              <th>Close</th>
              <th>Collateral</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((market) => (
              <tr key={market.id}>
                <td>
                  <Link href={`/markets/${market.id}`}>{market.question}</Link>
                </td>
                <td>{market.creator.name}</td>
                <td>{market.closeTime.toLocaleString()}</td>
                <td>{money(market.collateralCents)}</td>
                <td>{market.status}</td>
              </tr>
            ))}
            {markets.length === 0 ? (
              <tr>
                <td colSpan={5}>No open markets.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Create Market</h2>
        <form action={createMarketAction} className="form-grid">
          <label>
            Creator
            <select name="actorUserId" required>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.role})
                </option>
              ))}
            </select>
          </label>
          <label className="span-2">
            Question
            <input name="question" required placeholder="Will the demo work?" />
          </label>
          <label className="span-3">
            Resolution Criteria
            <textarea name="resolutionCriteria" required rows={2} />
          </label>
          <label>
            Close Time
            <input name="closeTime" type="datetime-local" defaultValue={defaultCloseTime} required />
          </label>
          <button type="submit">Create</button>
        </form>
      </section>

      <section>
        <h2>User Balances</h2>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Available</th>
              <th>Locked</th>
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
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td colSpan={6}>No users. Run the seed script to create local users.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}
