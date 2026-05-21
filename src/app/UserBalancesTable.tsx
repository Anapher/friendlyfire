"use client";

import { ResponsiveTable } from "./_ui/ResponsiveTable";
import { baseUserColumns, type BaseUserRow } from "./_ui/userColumns";

export function UserBalancesTable({ users }: { users: BaseUserRow[] }) {
  return (
    <ResponsiveTable
      rows={users}
      columns={baseUserColumns<BaseUserRow>()}
      rowKey={(user) => user.id}
      emptyMessage="No users. Run the seed script to create local users."
    />
  );
}
