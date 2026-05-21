"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { adjustUserBalance } from "@/server/ledger";
import {
  addUserToMarketBlacklist,
  correctMarketResolution,
  createMarket,
  resolveMarket,
} from "@/server/markets";
import { cancelOrder, placeLimitOrder } from "@/server/orders";
import { createUser } from "@/server/users";
import {
  clearCurrentSession,
  requestMagicLink,
  requireAdminUser,
  requireCurrentUser,
} from "@/server/auth";
import { createEmailAdapterFromEnv } from "@/server/emailAdapter";

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function parseEnum<const T extends readonly string[]>(
  formData: FormData,
  key: string,
  allowed: T,
): T[number] {
  const value = formString(formData, key);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${key} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

function parseInteger(formData: FormData, key: string) {
  const rawValue = formData.get(key);
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    throw new Error(`${key} must be an integer`);
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${key} must be an integer`);
  }
  return value;
}

function parseNonZeroInteger(formData: FormData, key: string) {
  const value = parseInteger(formData, key);
  if (value === 0) {
    throw new Error(`${key} must be non-zero`);
  }
  return value;
}

function parseNonNegativeInteger(formData: FormData, key: string) {
  const value = parseInteger(formData, key);
  if (value < 0) {
    throw new Error(`${key} must be non-negative`);
  }
  return value;
}

export async function requestMagicLinkAction(formData: FormData) {
  await requestMagicLink(
    db,
    formString(formData, "email"),
    createEmailAdapterFromEnv(),
    await requestBaseUrl(),
  );
  redirect("/login?sent=1");
}

export async function logoutAction() {
  await clearCurrentSession(db);
  redirect("/login");
}

export async function createMarketAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  await createMarket(db, {
    actorUserId: currentUser.id,
    question: formString(formData, "question"),
    resolutionCriteria: formString(formData, "resolutionCriteria"),
    closeTime: new Date(formString(formData, "closeTime")),
  });
  revalidatePath("/");
}

export async function placeOrderAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const marketId = formString(formData, "marketId");
  await placeLimitOrder(db, {
    userId: currentUser.id,
    marketId,
    outcome: parseEnum(formData, "outcome", ["YES", "NO"] as const),
    action: parseEnum(formData, "action", ["BUY", "SELL"] as const),
    limitPriceCents: parseInteger(formData, "limitPriceCents"),
    quantity: parseInteger(formData, "quantity"),
  });
  revalidatePath(`/markets/${marketId}`);
}

export async function cancelOrderAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const marketId = formString(formData, "marketId");
  await cancelOrder(db, {
    actorUserId: currentUser.id,
    orderId: formString(formData, "orderId"),
  });
  revalidatePath(`/markets/${marketId}`);
}

export async function resolveMarketAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const marketId = formString(formData, "marketId");
  await resolveMarket(db, {
    actorUserId: currentUser.id,
    marketId,
    resolution: parseEnum(formData, "resolution", ["YES", "NO", "CANCELLED"] as const),
    note: formString(formData, "note"),
  });
  revalidatePath(`/markets/${marketId}`);
  revalidatePath("/");
}

export async function correctMarketResolutionAction(formData: FormData) {
  const currentUser = await requireAdminUser();
  const marketId = formString(formData, "marketId");
  await correctMarketResolution(db, {
    actorUserId: currentUser.id,
    marketId,
    resolution: parseEnum(formData, "resolution", ["YES", "NO", "CANCELLED"] as const),
    note: formString(formData, "note"),
  });
  revalidatePath(`/markets/${marketId}`);
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function adjustBalanceAction(formData: FormData) {
  const currentUser = await requireAdminUser();
  await adjustUserBalance(db, {
    actorUserId: currentUser.id,
    targetUserId: formString(formData, "targetUserId"),
    amountCents: parseNonZeroInteger(formData, "amountCents"),
    note: formString(formData, "note"),
  });
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function createUserAction(formData: FormData) {
  const currentUser = await requireAdminUser();
  await createUser(db, {
    actorUserId: currentUser.id,
    name: formString(formData, "name"),
    email: formString(formData, "email"),
    role: parseEnum(formData, "role", ["USER", "ADMIN"] as const),
    startingBalanceCents: parseNonNegativeInteger(formData, "startingBalanceCents"),
    digestOptOut: formData.get("digestOptOut") === "on",
  });
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function blacklistUserAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const marketId = formString(formData, "marketId");
  await addUserToMarketBlacklist(db, {
    actorUserId: currentUser.id,
    marketId,
    userId: formString(formData, "userId"),
    note: formString(formData, "note"),
  });
  revalidatePath(`/markets/${marketId}`);
}

async function requestBaseUrl() {
  const configuredUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configuredUrl) {
    return normalizeBaseUrl(configuredUrl);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_BASE_URL must be configured before sending magic links in production");
  }

  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const localHosts = ["localhost", "127.0.0.1", "[::1]", "::1"];
  const hostname = new URL(`http://${host}`).hostname;
  const proto = headerStore.get("x-forwarded-proto") ?? (localHosts.includes(hostname) ? "http" : "https");
  return normalizeBaseUrl(`${proto}://${host}`);
}

function normalizeBaseUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("APP_BASE_URL must use http or https");
  }
  return url.origin;
}
