"use client";

import { useEffect, useState } from "react";
import { placeOrderAction } from "../../actions";
import { Button } from "../../_ui/Button";
import { Field, fieldInputClasses } from "../../_ui/Field";
import { Segmented } from "../../_ui/Segmented";
import { money } from "@/lib/format";
import type { OrderAction, Outcome } from "@/domain/types";

export type OrderPrefill = {
  outcome: Outcome;
  action: OrderAction;
  priceCents: number;
};

type OrderEntryProps = {
  marketId: string;
  prefill: OrderPrefill | null;
  onSubmitted?: () => void;
};

export function OrderEntry({ marketId, prefill, onSubmitted }: OrderEntryProps) {
  const [outcome, setOutcome] = useState<Outcome>(prefill?.outcome ?? "YES");
  const [side, setSide] = useState<OrderAction>(prefill?.action ?? "BUY");
  const [price, setPrice] = useState<string>(String(prefill?.priceCents ?? 50));
  const [quantity, setQuantity] = useState<string>("1");

  useEffect(() => {
    if (prefill) {
      setOutcome(prefill.outcome);
      setSide(prefill.action);
      setPrice(String(prefill.priceCents));
    }
  }, [prefill]);

  const priceCents = Number.parseInt(price, 10);
  const qty = Number.parseInt(quantity, 10);
  const validInputs =
    Number.isFinite(priceCents) &&
    Number.isFinite(qty) &&
    priceCents > 0 &&
    priceCents < 100 &&
    qty > 0;
  const maxPayoutCents = validInputs
    ? side === "BUY"
      ? (100 - priceCents) * qty
      : priceCents * qty
    : null;

  return (
    <form
      action={placeOrderAction}
      onSubmit={() => onSubmitted?.()}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="marketId" value={marketId} />
      <Field label="Outcome">
        <Segmented<Outcome>
          name="outcome"
          value={outcome}
          onChange={setOutcome}
          options={[
            { value: "YES", label: "YES" },
            { value: "NO", label: "NO" },
          ]}
          ariaLabel="Outcome"
        />
      </Field>
      <Field label="Side">
        <Segmented<OrderAction>
          name="action"
          value={side}
          onChange={setSide}
          options={[
            { value: "BUY", label: "BUY" },
            { value: "SELL", label: "SELL" },
          ]}
          ariaLabel="Side"
        />
      </Field>
      <Field
        label="Limit price"
        hint={
          maxPayoutCents !== null
            ? side === "BUY"
              ? `Max profit if ${outcome} wins: ${money(maxPayoutCents)}`
              : `Proceeds on fill: ${money(maxPayoutCents)}`
            : "Cents (1–99)"
        }
      >
        <div className="relative">
          <input
            name="limitPriceCents"
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            step={1}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            required
            className={fieldInputClasses("pr-8")}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
            ¢
          </span>
        </div>
      </Field>
      <Field label="Quantity">
        <input
          name="quantity"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          required
          className={fieldInputClasses()}
        />
      </Field>
      <Button type="submit" fullWidth>
        Place order
      </Button>
    </form>
  );
}
