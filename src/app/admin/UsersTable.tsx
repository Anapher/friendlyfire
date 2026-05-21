"use client";

import { ResponsiveTable, type Column } from "../_ui/ResponsiveTable";
import { baseUserColumns, type BaseUserRow } from "../_ui/userColumns";
import { AdjustBalanceDrawer } from "./AdjustBalanceDrawer";

export type AdminUserRow = BaseUserRow & {
  digestOptOut: boolean;
  createdAt: string;
};

const adminOnlyColumns: Column<AdminUserRow>[] = [
  {
    key: "digest",
    label: "Digest",
    priority: "desktop-only",
    render: (user) => (user.digestOptOut ? "Opted out" : "Enabled"),
  },
  {
    key: "created",
    label: "Created",
    priority: "desktop-only",
    render: (user) => new Date(user.createdAt).toLocaleString(),
  },
];

export function UsersTable({ users }: { users: AdminUserRow[] }) {
  return (
    <ResponsiveTable
      rows={users}
      columns={[...baseUserColumns<AdminUserRow>(), ...adminOnlyColumns]}
      rowKey={(user) => user.id}
      cardAction={(user) => (
        <AdjustBalanceDrawer targetUserId={user.id} targetUserName={user.name} />
      )}
      emptyMessage="No users. Run the seed script to create local users."
    />
  );
}
