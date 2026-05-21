import { requireCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { dateTimeInputValue } from "@/lib/format";
import type { MarketStatus, UserRole, UserStatus } from "@/domain/types";
import { PageHeader } from "./_ui/PageHeader";
import { MarketCard } from "./MarketCard";
import { NewMarketTrigger } from "./NewMarketTrigger";
import { UserBalancesTable } from "./UserBalancesTable";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requireCurrentUser();
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
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-3 py-4 md:px-6 md:py-6">
      <PageHeader
        title="Open Markets"
        subtitle="Local private prediction markets"
        rightSlot={<NewMarketTrigger defaultCloseTime={defaultCloseTime} />}
      />

      <section>
        {markets.length === 0 ? (
          <p className="rounded-lg border border-line bg-panel p-4 text-sm text-muted">
            No open markets.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {markets.map((market) => (
              <MarketCard
                key={market.id}
                market={{ ...market, status: market.status as MarketStatus }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-text">User balances</h2>
        <UserBalancesTable
          users={users.map((user) => ({
            ...user,
            role: user.role as UserRole,
            status: user.status as UserStatus,
          }))}
        />
      </section>
    </main>
  );
}
