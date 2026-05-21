"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SegmentedOption<Value extends string> = {
  value: Value;
  label: ReactNode;
};

type SegmentedProps<Value extends string> = {
  name: string;
  options: SegmentedOption<Value>[];
  defaultValue?: Value;
  value?: Value;
  onChange?: (value: Value) => void;
  ariaLabel?: string;
  className?: string;
};

export function Segmented<Value extends string>({
  name,
  options,
  defaultValue,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedProps<Value>) {
  const [internal, setInternal] = useState<Value | undefined>(defaultValue ?? options[0]?.value);
  const controlled = value !== undefined;
  const current = controlled ? value : internal;

  function select(next: Value) {
    if (!controlled) {
      setInternal(next);
    }
    onChange?.(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-grid w-full grid-flow-col auto-cols-fr rounded-md border border-line-strong bg-bg p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === current;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => select(option.value)}
            className={cn(
              "min-h-11 rounded px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              active ? "bg-panel text-text shadow-sm" : "text-muted hover:text-text",
            )}
          >
            {option.label}
          </button>
        );
      })}
      <input type="hidden" name={name} value={current ?? ""} />
    </div>
  );
}
