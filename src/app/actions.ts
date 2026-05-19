"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { adjustUserBalance } from "@/server/ledger";
import { addUserToMarketBlacklist, createMarket, resolveMarket } from "@/server/markets";
import { cancelOrder, placeLimitOrder } from "@/server/orders";

async function demoActorId() {
  const user = await db.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  return user.id;
}

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

export async function createMarketAction(formData: FormData) {
  await createMarket(db, {
    actorUserId: formString(formData, "actorUserId") || (await demoActorId()),
    question: formString(formData, "question"),
    description: formString(formData, "description"),
    resolutionCriteria: formString(formData, "resolutionCriteria"),
    closeTime: new Date(formString(formData, "closeTime")),
  });
  revalidatePath("/");
}

export async function placeOrderAction(formData: FormData) {
  const marketId = formString(formData, "marketId");
  await placeLimitOrder(db, {
    userId: formString(formData, "userId"),
    marketId,
    outcome: parseEnum(formData, "outcome", ["YES", "NO"] as const),
    action: parseEnum(formData, "action", ["BUY", "SELL"] as const),
    limitPriceCents: parseInteger(formData, "limitPriceCents"),
    quantity: parseInteger(formData, "quantity"),
  });
  revalidatePath(`/markets/${marketId}`);
}

export async function cancelOrderAction(formData: FormData) {
  const marketId = formString(formData, "marketId");
  await cancelOrder(db, {
    actorUserId: formString(formData, "userId"),
    orderId: formString(formData, "orderId"),
  });
  revalidatePath(`/markets/${marketId}`);
}

export async function resolveMarketAction(formData: FormData) {
  const marketId = formString(formData, "marketId");
  await resolveMarket(db, {
    actorUserId: formString(formData, "userId"),
    marketId,
    resolution: parseEnum(formData, "resolution", ["YES", "NO", "CANCELLED"] as const),
    note: formString(formData, "note"),
  });
  revalidatePath(`/markets/${marketId}`);
  revalidatePath("/");
}

export async function adjustBalanceAction(formData: FormData) {
  await adjustUserBalance(db, {
    actorUserId: formString(formData, "actorUserId"),
    targetUserId: formString(formData, "targetUserId"),
    amountCents: parseNonZeroInteger(formData, "amountCents"),
    note: formString(formData, "note"),
  });
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function blacklistUserAction(formData: FormData) {
  const marketId = formString(formData, "marketId");
  await addUserToMarketBlacklist(db, {
    actorUserId: formString(formData, "actorUserId"),
    marketId,
    userId: formString(formData, "userId"),
    note: formString(formData, "note"),
  });
  revalidatePath(`/markets/${marketId}`);
}
