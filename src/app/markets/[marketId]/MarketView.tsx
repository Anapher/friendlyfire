"use client";

import { useState } from "react";
import { Badge } from "../../_ui/Badge";
import { Drawer } from "../../_ui/Drawer";
import { OrderBookLadder } from "../../_ui/OrderBookLadder";
import { PageHeader } from "../../_ui/PageHeader";
import { Tabs, type TabDefinition } from "../../_ui/Tabs";
import { ManageTab } from "./ManageTab";
import { OrderEntry, type OrderPrefill } from "./OrderEntry";
import { RecentTradesTable } from "./RecentTradesTable";
import { TradeTab } from "./TradeTab";
import type { BookLevel } from "@/lib/bookView";
import type { MarketStatus } from "@/domain/types";
import type {
  BlacklistRow,
  MarketSummary,
  OpenOrderRow,
  Person,
  PositionRow,
  TradeRow,
} from "./types";

type MarketViewProps = {
  market: MarketSummary;
  bookLevels: BookLevel[];
  openOrders: OpenOrderRow[];
  recentTrades: TradeRow[];
  positions: PositionRow[];
  blacklist: BlacklistRow[];
  users: Person[];
  currentUserId: string;
  canManage: boolean;
  isAdmin: boolean;
};

const statusToTone: Record<MarketStatus, "info" | "success" | "muted"> = {
  OPEN: "info",
  CLOSED: "muted",
  RESOLVED: "success",
};

export function MarketView({
  market,
  bookLevels,
  openOrders,
  recentTrades,
  positions,
  blacklist,
  users,
  currentUserId,
  canManage,
  isAdmin,
}: MarketViewProps) {
  const [orderOpen, setOrderOpen] = useState(false);
  const [prefill, setPrefill] = useState<OrderPrefill | null>(null);

  const myPositions = positions.filter((p) => p.userId === currentUserId);
  const myOpenOrders = openOrders.filter((o) => o.userId === currentUserId);

  function openOrderDrawer(next: OrderPrefill | null) {
    setPrefill(next);
    setOrderOpen(true);
  }

  const tabs: TabDefinition[] = [
    {
      value: "trade",
      label: "Trade",
      content: (
        <TradeTab
          market={market}
          bookLevels={bookLevels}
          myPositions={myPositions}
          myOpenOrders={myOpenOrders}
          onPlaceOrder={openOrderDrawer}
          onPrefillInline={setPrefill}
          prefill={prefill}
        />
      ),
    },
    {
      value: "book",
      label: "Book",
      content: <OrderBookLadder levels={bookLevels} onTap={openOrderDrawer} />,
    },
    {
      value: "activity",
      label: "Activity",
      content: <RecentTradesTable trades={recentTrades} />,
    },
  ];

  if (canManage) {
    tabs.push({
      value: "manage",
      label: "Manage",
      content: (
        <ManageTab
          market={market}
          positions={positions}
          blacklist={blacklist}
          users={users}
          isAdmin={isAdmin}
        />
      ),
    });
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-3 py-4 md:px-6 md:py-6">
      <PageHeader
        back="/"
        title={market.question}
        subtitle={
          <span className="flex items-center gap-2">
            <Badge tone={statusToTone[market.status]}>{market.status}</Badge>
            <span className="text-muted">
              closes {new Date(market.closeTime).toLocaleString()}
            </span>
          </span>
        }
      />
      <Tabs tabs={tabs} />

      <Drawer
        open={orderOpen}
        onOpenChange={setOrderOpen}
        title="Place order"
        description={market.question}
      >
        <OrderEntry
          marketId={market.id}
          prefill={prefill}
          onSubmitted={() => setOrderOpen(false)}
        />
      </Drawer>
    </main>
  );
}
