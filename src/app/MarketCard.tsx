"use client";

import Link from "next/link";
import { Badge } from "./_ui/Badge";
import { formatRelativeTime, money } from "@/lib/format";
import type { CheapestTradePrices } from "@/lib/bookView";
import type { MarketStatus } from "@/domain/types";

type MarketCardProps = {
  market: {
    id: string;
    question: string;
    closeTime: Date;
    collateralCents: number;
    status: MarketStatus;
    creator: { name: string };
    cheapestPrices: CheapestTradePrices;
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
      {market.cheapestPrices.yesCents !== null || market.cheapestPrices.noCents !== null ? (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <PricePill
            label="Buy YES"
            priceCents={market.cheapestPrices.yesCents}
            tone="success"
          />
          <PricePill
            label="Buy NO"
            priceCents={market.cheapestPrices.noCents}
            tone="danger"
          />
        </div>
      ) : null}
      <p className="text-sm text-muted">Collateral {money(market.collateralCents)}</p>
    </article>
  );
}

function PricePill({
  label,
  priceCents,
  tone,
}: {
  label: string;
  priceCents: number | null;
  tone: "success" | "danger";
}) {
  const toneClasses =
    tone === "success"
      ? "border-success/20 bg-success/10 text-success"
      : "border-danger/20 bg-danger/10 text-danger";

  return (
    <div className={`rounded-md border px-2 py-1 ${toneClasses}`}>
      <span className="block text-xs uppercase tracking-wide opacity-80">{label}</span>
      <span className="font-mono text-sm font-semibold tabular-nums">
        {priceCents === null ? "—" : `${priceCents}¢`}
      </span>
    </div>
  );
}
