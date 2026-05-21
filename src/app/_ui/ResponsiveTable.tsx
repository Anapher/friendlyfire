"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ColumnPriority = "primary" | "secondary" | "desktop-only";

export type Column<Row> = {
  key: string;
  label: string;
  render: (row: Row) => ReactNode;
  priority: ColumnPriority;
};

type ResponsiveTableProps<Row> = {
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  emptyMessage?: ReactNode;
  cardAction?: (row: Row) => ReactNode;
  className?: string;
};

export function ResponsiveTable<Row>({
  rows,
  columns,
  rowKey,
  emptyMessage = "No data.",
  cardAction,
  className,
}: ResponsiveTableProps<Row>) {
  const desktopColumns = columns;
  const primary = columns.filter((c) => c.priority === "primary");
  const secondary = columns.filter((c) => c.priority === "secondary");

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-3 md:hidden">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">{emptyMessage}</p>
        ) : (
          rows.map((row) => (
            <div
              key={rowKey(row)}
              className="rounded-lg border border-line bg-panel p-3"
            >
              {primary.map((column) => (
                <div key={column.key} className="text-base text-text">
                  {column.render(row)}
                </div>
              ))}
              {secondary.length > 0 ? (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  {secondary.map((column) => (
                    <div key={column.key} className="flex flex-col">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {column.label}
                      </dt>
                      <dd className="text-text">{column.render(row)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {cardAction ? <div className="mt-3">{cardAction(row)}</div> : null}
            </div>
          ))
        )}
      </div>

      <div className="hidden md:block">
        <div className="overflow-x-auto rounded-lg border border-line bg-panel">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-bg text-xs uppercase tracking-wide text-muted">
              <tr>
                {desktopColumns.map((column) => (
                  <th key={column.key} className="px-3 py-2 text-left font-semibold">
                    {column.label}
                  </th>
                ))}
                {cardAction ? <th aria-hidden /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={desktopColumns.length + (cardAction ? 1 : 0)}
                    className="px-3 py-4 text-muted"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={rowKey(row)} className="border-t border-line">
                    {desktopColumns.map((column) => (
                      <td key={column.key} className="px-3 py-2 align-top text-text">
                        {column.render(row)}
                      </td>
                    ))}
                    {cardAction ? (
                      <td className="px-3 py-2 align-top text-right">{cardAction(row)}</td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
