"use client";

import { cn } from "@/lib/cn";
import {
  bestPrices,
  buildLadder,
  type BookLevel,
} from "@/lib/bookView";
import type { OrderAction, Outcome } from "@/domain/types";

export type LadderTap = {
  outcome: Outcome;
  action: OrderAction;
  priceCents: number;
};

type OrderBookLadderProps = {
  levels: BookLevel[];
  onTap?: (tap: LadderTap) => void;
};

export function OrderBookLadder({ levels, onTap }: OrderBookLadderProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <LadderColumn outcome="YES" levels={levels} onTap={onTap} />
      <LadderColumn outcome="NO" levels={levels} onTap={onTap} />
    </div>
  );
}

type LadderColumnProps = {
  outcome: Outcome;
  levels: BookLevel[];
  onTap?: (tap: LadderTap) => void;
};

function LadderColumn({ outcome, levels, onTap }: LadderColumnProps) {
  const rows = buildLadder(levels, outcome);
  const { bestBidCents, bestAskCents } = bestPrices(rows);

  return (
    <section className="rounded-lg border border-line bg-panel">
      <header className="flex items-center justify-between border-b border-line px-3 py-2 text-sm font-semibold">
        <span>{outcome}</span>
        <span className="font-normal text-muted">
          {bestBidCents !== null && bestAskCents !== null
            ? `${bestBidCents}¢ / ${bestAskCents}¢`
            : "—"}
        </span>
      </header>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center text-sm">
        <div className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted">
          Bid
        </div>
        <div className="px-3 py-2 text-center text-xs uppercase tracking-wide text-muted">
          Price
        </div>
        <div className="px-3 py-2 text-left text-xs uppercase tracking-wide text-muted">
          Ask
        </div>
        {rows.length === 0 ? (
          <div className="col-span-3 px-3 py-4 text-center text-muted">No book.</div>
        ) : null}
        {rows.map((row) => {
          const isBestBid = row.bidQuantity > 0 && row.priceCents === bestBidCents;
          const isBestAsk = row.askQuantity > 0 && row.priceCents === bestAskCents;
          return (
            <LadderRow
              key={row.priceCents}
              outcome={outcome}
              row={row}
              isBestBid={isBestBid}
              isBestAsk={isBestAsk}
              onTap={onTap}
            />
          );
        })}
      </div>
    </section>
  );
}

type LadderRowProps = {
  outcome: Outcome;
  row: { priceCents: number; bidQuantity: number; askQuantity: number };
  isBestBid: boolean;
  isBestAsk: boolean;
  onTap?: (tap: LadderTap) => void;
};

function LadderRow({ outcome, row, isBestBid, isBestAsk, onTap }: LadderRowProps) {
  return (
    <>
      <button
        type="button"
        disabled={!onTap || row.bidQuantity === 0}
        onClick={() => onTap?.({ outcome, action: "SELL", priceCents: row.priceCents })}
        className={cn(
          "min-h-11 px-3 py-2 text-right font-mono tabular-nums text-text disabled:cursor-default disabled:text-muted",
          row.bidQuantity > 0 ? "hover:bg-success/10" : null,
          isBestBid ? "bg-success/10 font-semibold" : null,
        )}
        aria-label={
          row.bidQuantity > 0
            ? `Sell ${outcome} into ${row.bidQuantity} at ${row.priceCents}¢`
            : undefined
        }
      >
        {row.bidQuantity > 0 ? row.bidQuantity : "—"}
      </button>
      <div className="px-3 py-2 text-center font-mono tabular-nums text-muted">
        {row.priceCents}¢
      </div>
      <button
        type="button"
        disabled={!onTap || row.askQuantity === 0}
        onClick={() => onTap?.({ outcome, action: "BUY", priceCents: row.priceCents })}
        className={cn(
          "min-h-11 px-3 py-2 text-left font-mono tabular-nums text-text disabled:cursor-default disabled:text-muted",
          row.askQuantity > 0 ? "hover:bg-danger/10" : null,
          isBestAsk ? "bg-danger/10 font-semibold" : null,
        )}
        aria-label={
          row.askQuantity > 0
            ? `Buy ${outcome} ${row.askQuantity} at ${row.priceCents}¢`
            : undefined
        }
      >
        {row.askQuantity > 0 ? row.askQuantity : "—"}
      </button>
    </>
  );
}
