"use client";

import { Card } from "../../_ui/Card";
import { ResponsiveTable, type Column } from "../../_ui/ResponsiveTable";
import { BlacklistForm } from "./BlacklistForm";
import { ResolveForm } from "./ResolveForm";
import type {
  BlacklistRow,
  MarketSummary,
  Person,
  PositionRow,
} from "./types";

const positionColumns: Column<PositionRow>[] = [
  { key: "user", label: "User", priority: "primary", render: (row) => row.user.name },
  {
    key: "outcome",
    label: "Outcome",
    priority: "secondary",
    render: (row) => row.outcome,
  },
  {
    key: "available",
    label: "Available",
    priority: "secondary",
    render: (row) => row.availableQuantity,
  },
  {
    key: "locked",
    label: "Locked",
    priority: "secondary",
    render: (row) => row.lockedQuantity,
  },
];

const blacklistColumns: Column<BlacklistRow>[] = [
  { key: "user", label: "User", priority: "primary", render: (row) => row.user.name },
  {
    key: "by",
    label: "By",
    priority: "secondary",
    render: (row) => row.createdBy.name,
  },
  {
    key: "note",
    label: "Note",
    priority: "secondary",
    render: (row) => row.note ?? "—",
  },
];

type ManageTabProps = {
  market: MarketSummary;
  positions: PositionRow[];
  blacklist: BlacklistRow[];
  users: Person[];
  isAdmin: boolean;
};

export function ManageTab({
  market,
  positions,
  blacklist,
  users,
  isAdmin,
}: ManageTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">All positions</h2>
        <ResponsiveTable
          rows={positions}
          columns={positionColumns}
          rowKey={(row) => row.id}
          emptyMessage="No positions."
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Blacklist</h2>
        <Card>
          <BlacklistForm marketId={market.id} users={users} />
        </Card>
        <ResponsiveTable
          rows={blacklist}
          columns={blacklistColumns}
          rowKey={(row) => `${row.marketId}-${row.userId}`}
          emptyMessage="No blacklisted users."
        />
      </section>

      {market.status !== "RESOLVED" ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Resolve</h2>
          <Card>
            <ResolveForm marketId={market.id} mode="RESOLVE" />
          </Card>
        </section>
      ) : null}

      {market.status === "RESOLVED" && isAdmin ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Admin correction</h2>
          <Card>
            <ResolveForm
              marketId={market.id}
              mode="CORRECT"
              defaultResolution={market.resolution ?? "YES"}
            />
          </Card>
        </section>
      ) : null}
    </div>
  );
}
