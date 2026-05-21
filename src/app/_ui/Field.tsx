"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

type FieldProps = {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function Field({ label, htmlFor, hint, className, children }: FieldProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("flex flex-col gap-1 text-sm font-medium text-text", className)}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

const inputClasses =
  "min-h-11 w-full rounded-md border border-line-strong bg-panel px-3 text-base text-text shadow-inner placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function fieldInputClasses(extra?: string) {
  return cn(inputClasses, extra);
}
