import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getSessionUser } from "@/server/auth";
import { ToastProvider } from "./_ui/Toast";
import { TopBar } from "./_ui/TopBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "FriendlyFire",
  description: "Private prediction markets",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  const topBarUser = user ? { name: user.name, isAdmin: user.role === "ADMIN" } : null;

  return (
    <html lang="en">
      <body className="min-h-dvh bg-bg text-text font-sans antialiased">
        <ToastProvider>
          {topBarUser ? <TopBar user={topBarUser} /> : null}
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
