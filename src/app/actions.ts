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
    outcome: formString(formData, "outcome") as "YES" | "NO",
    action: formString(formData, "action") as "BUY" | "SELL",
    limitPriceCents: Number(formData.get("limitPriceCents")),
    quantity: Number(formData.get("quantity")),
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
    resolution: formString(formData, "resolution") as "YES" | "NO" | "CANCELLED",
    note: formString(formData, "note"),
  });
  revalidatePath(`/markets/${marketId}`);
  revalidatePath("/");
}

export async function adjustBalanceAction(formData: FormData) {
  await adjustUserBalance(db, {
    actorUserId: formString(formData, "actorUserId"),
    targetUserId: formString(formData, "targetUserId"),
    amountCents: Number(formData.get("amountCents")),
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
