"use client";

import { Badge } from "../../_ui/Badge";
import { Button } from "../../_ui/Button";
import { Card } from "../../_ui/Card";
import { OrderBookLadder } from "../../_ui/OrderBookLadder";
import { money, userLabel } from "@/lib/format";
import type { BookLevel } from "@/lib/bookView";
import { CancelOrderButton } from "./CancelOrderButton";
import { OrderEntry, type OrderPrefill } from "./OrderEntry";
import type { MarketSummary, OpenOrderRow, PositionRow } from "./types";

type TradeTabProps = {
  market: MarketSummary;
  bookLevels: BookLevel[];
  myPositions: PositionRow[];
  myOpenOrders: OpenOrderRow[];
  onPlaceOrder: (prefill: OrderPrefill | null) => void;
  onPrefillInline: (prefill: OrderPrefill | null) => void;
  prefill: OrderPrefill | null;
};

export function TradeTab({
  market,
  bookLevels,
  myPositions,
  myOpenOrders,
  onPlaceOrder,
  onPrefillInline,
  prefill,
}: TradeTabProps) {
  return (
    <div className="flex flex-col gap-4">
      <MarketSummaryCard market={market} />
      <YourPositionsCard positions={myPositions} />

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,360px)]">
        <div className="lg:order-first">
          <div className="hidden lg:block">
            <OrderBookLadder levels={bookLevels} onTap={onPrefillInline} />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Button onClick={() => onPlaceOrder(null)} fullWidth className="lg:hidden">
            Place order
          </Button>
          <Card className="hidden lg:block">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Order entry
            </h2>
            <OrderEntry marketId={market.id} prefill={prefill} />
          </Card>
        </div>
      </div>

      <YourOpenOrders marketId={market.id} orders={myOpenOrders} />
    </div>
  );
}

function MarketSummaryCard({ market }: { market: MarketSummary }) {
  return (
    <Card>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Market</h2>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <SummaryField label="Creator">{market.creator.name}</SummaryField>
        <SummaryField label="Close">
          {new Date(market.closeTime).toLocaleString()}
        </SummaryField>
        <SummaryField label="Collateral">{money(market.collateralCents)}</SummaryField>
        <SummaryField label="Resolution">{market.resolution ?? "—"}</SummaryField>
        <SummaryField label="Resolved by">{userLabel(market.resolvedBy)}</SummaryField>
      </dl>
      <div className="mt-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Resolution criteria
        </p>
        <p className="mt-2 whitespace-pre-wrap text-text">{market.resolutionCriteria}</p>
        {market.resolutionNote ? (
          <>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Resolution note
            </p>
            <p className="whitespace-pre-wrap text-text">{market.resolutionNote}</p>
          </>
        ) : null}
      </div>
    </Card>
  );
}

function SummaryField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function YourPositionsCard({ positions }: { positions: PositionRow[] }) {
  if (positions.length === 0) {
    return null;
  }
  return (
    <Card>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        Your positions
      </h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {positions.map((position) => (
          <Badge
            key={position.id}
            tone={position.outcome === "YES" ? "success" : "info"}
          >
            {position.outcome} · {position.availableQuantity} avail
            {position.lockedQuantity > 0 ? ` / ${position.lockedQuantity} locked` : null}
          </Badge>
        ))}
      </div>
    </Card>
  );
}

function YourOpenOrders({
  marketId,
  orders,
}: {
  marketId: string;
  orders: OpenOrderRow[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        Your open orders
      </h2>
      {orders.length === 0 ? (
        <p className="text-sm text-muted">No open orders.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((order) => (
            <OpenOrderCard key={order.id} marketId={marketId} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}

function OpenOrderCard({ marketId, order }: { marketId: string; order: OpenOrderRow }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel p-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {order.action} {order.outcome} · {order.remainingQuantity}/{order.originalQuantity} @{" "}
          {order.limitPriceCents}¢
        </p>
        <p className="text-xs text-muted">
          {order.status} · locked{" "}
          {order.lockedCents > 0
            ? money(order.lockedCents)
            : `${order.lockedQuantity} shares`}
        </p>
      </div>
      <CancelOrderButton marketId={marketId} orderId={order.id} />
    </div>
  );
}
