import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { summarizeBook } from "@/lib/bookView";
import type {
  MarketStatus,
  OrderAction,
  OrderStatus,
  Outcome,
  Resolution,
} from "@/domain/types";
import { MarketView } from "./MarketView";

export const dynamic = "force-dynamic";

type MarketPageProps = {
  params: Promise<{ marketId: string }>;
};

export default async function MarketPage({ params }: MarketPageProps) {
  const currentUser = await requireCurrentUser();
  const { marketId } = await params;

  const [market, users] = await Promise.all([
    db.market.findUnique({
      where: { id: marketId },
      include: {
        creator: true,
        resolvedBy: true,
        blacklist: {
          include: { user: true, createdBy: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    db.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] }),
  ]);

  if (!market) {
    notFound();
  }

  const [openOrders, recentTrades, positions] = await Promise.all([
    db.order.findMany({
      where: { marketId, status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
      include: { user: true },
      orderBy: [{ outcome: "asc" }, { action: "asc" }, { limitPriceCents: "desc" }],
    }),
    db.trade.findMany({
      where: { marketId },
      include: { buyer: true, seller: true, yesBuyer: true, noBuyer: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.position.findMany({
      where: { marketId },
      include: { user: true },
      orderBy: [{ user: { name: "asc" } }, { outcome: "asc" }],
    }),
  ]);

  const bookLevels = summarizeBook(openOrders);
  const canManage =
    currentUser.role === "ADMIN" || market.creatorId === currentUser.id;
  const isAdmin = currentUser.role === "ADMIN";

  return (
    <MarketView
      market={{
        id: market.id,
        question: market.question,
        status: market.status as MarketStatus,
        closeTime: market.closeTime.toISOString(),
        collateralCents: market.collateralCents,
        resolutionCriteria: market.resolutionCriteria,
        resolution: market.resolution as Resolution | null,
        resolutionNote: market.resolutionNote,
        creator: { id: market.creator.id, name: market.creator.name },
        resolvedBy: market.resolvedBy
          ? { id: market.resolvedBy.id, name: market.resolvedBy.name }
          : null,
      }}
      bookLevels={bookLevels}
      openOrders={openOrders.map((order) => ({
        id: order.id,
        userId: order.userId,
        user: { id: order.user.id, name: order.user.name },
        outcome: order.outcome as Outcome,
        action: order.action as OrderAction,
        limitPriceCents: order.limitPriceCents,
        originalQuantity: order.originalQuantity,
        remainingQuantity: order.remainingQuantity,
        lockedCents: order.lockedCents,
        lockedQuantity: order.lockedQuantity,
        status: order.status as OrderStatus,
      }))}
      recentTrades={recentTrades.map((trade) => ({
        id: trade.id,
        createdAt: trade.createdAt.toISOString(),
        kind: trade.kind,
        outcome: trade.outcome as Outcome | null,
        quantity: trade.quantity,
        priceCents: trade.priceCents,
        yesPriceCents: trade.yesPriceCents,
        noPriceCents: trade.noPriceCents,
        buyer: trade.buyer ? { id: trade.buyer.id, name: trade.buyer.name } : null,
        seller: trade.seller ? { id: trade.seller.id, name: trade.seller.name } : null,
        yesBuyer: trade.yesBuyer
          ? { id: trade.yesBuyer.id, name: trade.yesBuyer.name }
          : null,
        noBuyer: trade.noBuyer ? { id: trade.noBuyer.id, name: trade.noBuyer.name } : null,
      }))}
      positions={positions.map((position) => ({
        id: position.id,
        userId: position.userId,
        user: { id: position.user.id, name: position.user.name },
        outcome: position.outcome as Outcome,
        availableQuantity: position.availableQuantity,
        lockedQuantity: position.lockedQuantity,
      }))}
      blacklist={market.blacklist.map((entry) => ({
        marketId: entry.marketId,
        userId: entry.userId,
        user: { id: entry.user.id, name: entry.user.name },
        createdBy: { id: entry.createdBy.id, name: entry.createdBy.name },
        note: entry.note,
      }))}
      users={users.map((user) => ({ id: user.id, name: user.name }))}
      currentUserId={currentUser.id}
      canManage={canManage}
      isAdmin={isAdmin}
    />
  );
}
