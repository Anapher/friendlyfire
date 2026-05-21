"use client";

import Link from "next/link";
import { Badge } from "./_ui/Badge";
import { formatRelativeTime, money } from "@/lib/format";
import type { MarketStatus } from "@/domain/types";

type MarketCardProps = {
  market: {
    id: string;
    question: string;
    closeTime: Date;
    collateralCents: number;
    status: MarketStatus;
    creator: { name: string };
  };
};

const statusToTone: Record<MarketStatus, "info" | "success" | "muted"> = {
  OPEN: "info",
  CLOSED: "muted",
  RESOLVED: "success",
};

export function MarketCard({ market }: MarketCardProps) {
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-4 transition hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 min-w-0 text-base font-semibold">
          <Link
            href={`/markets/${market.id}`}
            className="text-text no-underline hover:underline"
          >
            {market.question}
          </Link>
        </h3>
        <Badge tone={statusToTone[market.status]}>{market.status}</Badge>
      </div>
      <p className="text-sm text-muted">
        {market.creator.name} · closes{" "}
        <time dateTime={market.closeTime.toISOString()} title={market.closeTime.toLocaleString()}>
          {formatRelativeTime(market.closeTime)}
        </time>
      </p>
      <details className="text-sm text-muted">
        <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-accent-strong">
          Details
        </summary>
        <p className="mt-1">Collateral {money(market.collateralCents)}</p>
      </details>
    </article>
  );
}
