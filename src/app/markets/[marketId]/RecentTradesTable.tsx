"use client";

import { ResponsiveTable, type Column } from "../../_ui/ResponsiveTable";
import { userLabel } from "@/lib/format";
import type { TradeRow } from "./types";

const columns: Column<TradeRow>[] = [
  {
    key: "time",
    label: "Time",
    priority: "primary",
    render: (trade) => new Date(trade.createdAt).toLocaleString(),
  },
  {
    key: "summary",
    label: "Trade",
    priority: "primary",
    render: (trade) => (
      <span className="font-mono tabular-nums">
        {trade.kind === "PRIMARY"
          ? `PRIMARY · ${trade.quantity} · YES ${trade.yesPriceCents}¢ / NO ${trade.noPriceCents}¢`
          : `${trade.outcome ?? "?"} · ${trade.quantity} @ ${trade.priceCents}¢`}
      </span>
    ),
  },
  {
    key: "participants",
    label: "Participants",
    priority: "secondary",
    render: (trade) =>
      trade.kind === "PRIMARY"
        ? `${userLabel(trade.yesBuyer)} YES · ${userLabel(trade.noBuyer)} NO`
        : `${userLabel(trade.buyer)} bought from ${userLabel(trade.seller)}`,
  },
];

export function RecentTradesTable({ trades }: { trades: TradeRow[] }) {
  return (
    <ResponsiveTable
      rows={trades}
      columns={columns}
      rowKey={(trade) => trade.id}
      emptyMessage="No trades yet."
    />
  );
}
