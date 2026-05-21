"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: string;
  rightSlot?: ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, back, rightSlot, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-2">
        {back ? (
          <Link
            href={back}
            aria-label="Back"
            className="-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </Link>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold leading-tight text-text md:text-2xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
    </div>
  );
}
