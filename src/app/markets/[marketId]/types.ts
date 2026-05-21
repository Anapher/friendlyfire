import type {
  MarketStatus,
  OrderAction,
  OrderStatus,
  Outcome,
  Resolution,
} from "@/domain/types";

export type Person = { id: string; name: string };

export type MarketSummary = {
  id: string;
  question: string;
  status: MarketStatus;
  closeTime: string;
  collateralCents: number;
  resolutionCriteria: string;
  resolution: Resolution | null;
  resolutionNote: string | null;
  creator: Person;
  resolvedBy: Person | null;
};

export type OpenOrderRow = {
  id: string;
  userId: string;
  user: Person;
  outcome: Outcome;
  action: OrderAction;
  limitPriceCents: number;
  originalQuantity: number;
  remainingQuantity: number;
  lockedCents: number;
  lockedQuantity: number;
  status: OrderStatus;
};

export type TradeRow = {
  id: string;
  createdAt: string;
  kind: string;
  outcome: Outcome | null;
  quantity: number;
  priceCents: number | null;
  yesPriceCents: number | null;
  noPriceCents: number | null;
  buyer: Person | null;
  seller: Person | null;
  yesBuyer: Person | null;
  noBuyer: Person | null;
};

export type PositionRow = {
  id: string;
  userId: string;
  user: Person;
  outcome: Outcome;
  availableQuantity: number;
  lockedQuantity: number;
};

export type BlacklistRow = {
  marketId: string;
  userId: string;
  user: Person;
  createdBy: Person;
  note: string | null;
};
