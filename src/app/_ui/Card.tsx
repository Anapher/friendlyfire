"use client";

import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function Card({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg border border-line bg-panel p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:p-4",
          className,
        )}
        {...props}
      />
    );
  },
);
