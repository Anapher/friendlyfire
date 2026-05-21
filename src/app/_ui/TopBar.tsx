"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogOut, Menu, Shield } from "lucide-react";
import { logoutAction } from "../actions";
import { cn } from "@/lib/cn";

type TopBarUser = {
  name: string;
  isAdmin: boolean;
};

type TopBarProps = {
  user?: TopBarUser | null;
  className?: string;
};

export function TopBar({ user, className }: TopBarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-line bg-panel/85 px-3 backdrop-blur md:h-16 md:px-6",
        className,
      )}
    >
      <Link href="/" className="text-base font-bold text-text no-underline md:text-lg">
        FriendlyFire
      </Link>
      {user ? (
        <>
          <nav className="hidden items-center gap-2 md:flex">
            <span className="text-sm text-muted">Signed in as {user.name}</span>
            {user.isAdmin ? (
              <Link
                href="/admin"
                className="inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold text-accent-strong hover:bg-bg"
              >
                Admin
              </Link>
            ) : null}
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold text-text hover:bg-bg"
              >
                Logout
              </button>
            </form>
          </nav>

          <div className="md:hidden">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                aria-label="Open menu"
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-text hover:bg-bg"
              >
                <Menu className="h-5 w-5" aria-hidden />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="z-50 min-w-[12rem] rounded-md border border-line bg-panel p-1 shadow-lg"
                >
                  <DropdownMenu.Label className="px-2 py-1 text-xs text-muted">
                    Signed in as {user.name}
                  </DropdownMenu.Label>
                  {user.isAdmin ? (
                    <DropdownMenu.Item asChild>
                      <Link
                        href="/admin"
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm text-text outline-none data-[highlighted]:bg-bg"
                      >
                        <Shield className="h-4 w-4" aria-hidden /> Admin
                      </Link>
                    </DropdownMenu.Item>
                  ) : null}
                  <DropdownMenu.Item
                    onSelect={() => {
                      void logoutAction();
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm text-text outline-none data-[highlighted]:bg-bg"
                  >
                    <LogOut className="h-4 w-4" aria-hidden /> Logout
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </>
      ) : null}
    </header>
  );
}
