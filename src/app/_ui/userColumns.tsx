"use client";

import type { ReactNode } from "react";
import { Badge } from "./Badge";
import type { Column } from "./ResponsiveTable";
import { money } from "@/lib/format";
import type { UserRole, UserStatus } from "@/domain/types";

export type BaseUserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  availableCents: number;
  lockedCents: number;
};

export function baseUserColumns<R extends BaseUserRow>(): Column<R>[] {
  return [
    {
      key: "name",
      label: "User",
      priority: "primary",
      render: (user) => (
        <div className="flex flex-col">
          <span className="font-semibold text-text">{user.name}</span>
          <span className="text-xs text-muted">{user.email}</span>
        </div>
      ),
    },
    {
      key: "role",
      label: "Role",
      priority: "secondary",
      render: (user) => (
        <Badge tone={user.role === "ADMIN" ? "info" : "muted"}>{user.role}</Badge>
      ),
    },
    {
      key: "status",
      label: "Status",
      priority: "secondary",
      render: (user) => (
        <Badge tone={user.status === "ACTIVE" ? "success" : "danger"}>{user.status}</Badge>
      ),
    },
    {
      key: "available",
      label: "Available",
      priority: "secondary",
      render: (user) => (
        <span className="font-mono tabular-nums">{money(user.availableCents)}</span>
      ),
    },
    {
      key: "locked",
      label: "Locked",
      priority: "secondary",
      render: (user) => (
        <span className="font-mono tabular-nums">{money(user.lockedCents)}</span>
      ),
    },
  ];
}

export function moneyCell(cents: number): ReactNode {
  return <span className="font-mono tabular-nums">{money(cents)}</span>;
}
