# Private Prediction Market MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local private prediction-market MVP where trusted users create binary markets, trade YES/NO shares through limit orders, settle markets, and admins adjust balances.

**Architecture:** Use a Next.js App Router application with the trading and ledger rules isolated in pure TypeScript domain services. Persist state with Prisma and SQLite for local development, with the schema written so PostgreSQL can be introduced later. Keep UI routes thin: server actions validate inputs, call domain/application services, and render derived state.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, SQLite, Vitest, React Testing Library, Nodemailer-compatible email adapter.

---

## Scope

This plan implements the first usable private app:

- User records with name, email, role, status, balances, and digest preference.
- Admin balance adjustments.
- Binary markets with close times, blacklists, early resolution, and cancelled resolution.
- Limit orders only.
- Complementary YES/NO buy matching for primary issuance.
- Same-outcome buy/sell matching for secondary trading.
- Ledger-backed cash and collateral accounting.
- Positions and locked shares.
- Audit log.
- Digest email job plumbing with a console email adapter for local use.

The plan does not implement payment processing, multiple groups, market orders, short-selling, comments, push notifications, or production email delivery.

## File Structure

- `package.json`: scripts and dependencies.
- `tsconfig.json`: TypeScript config.
- `vitest.config.ts`: unit test config.
- `prisma/schema.prisma`: database schema.
- `src/domain/types.ts`: shared domain enums and value types.
- `src/domain/errors.ts`: typed domain errors.
- `src/domain/money.ts`: integer-cent helpers.
- `src/domain/orderBook.ts`: pure matching logic.
- `src/domain/settlement.ts`: pure settlement calculations.
- `src/server/db.ts`: Prisma client.
- `src/server/audit.ts`: audit helper.
- `src/server/ledger.ts`: balance and ledger mutations.
- `src/server/orders.ts`: order placement, locking, cancellation, matching orchestration.
- `src/server/markets.ts`: market creation, blacklist, close, resolution.
- `src/server/emailDigest.ts`: digest selection and email send orchestration.
- `src/server/emailAdapter.ts`: local console email adapter.
- `src/app/*`: minimal app routes and forms.
- `tests/domain/*.test.ts`: pure domain tests.
- `tests/server/*.test.ts`: database-backed service tests.

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/app/page.tsx`

- [ ] **Step 1: Create baseline package metadata**

Create `package.json`:

```json
{
  "name": "friendlyfire",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.0.0",
    "next": "^15.0.0",
    "nodemailer": "^6.9.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@types/node": "^22.0.0",
    "@types/nodemailer": "^6.4.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "prisma": "^5.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create TypeScript and test config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Create gitignore and placeholder home page**

Create `.gitignore`:

```gitignore
node_modules
.next
.env
.env.local
coverage
prisma/dev.db
prisma/dev.db-journal
.superpowers/
```

Create `src/app/page.tsx`:

```tsx
export default function HomePage() {
  return <main>FriendlyFire private markets</main>;
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 5: Verify scaffold**

Run: `npm run test`

Expected: Vitest starts and reports no test files or an empty passing suite.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/app/page.tsx
git commit -m "chore: scaffold app"
```

## Task 2: Domain Types, Money, And Errors

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/money.ts`
- Create: `src/domain/errors.ts`
- Test: `tests/domain/money.test.ts`

- [ ] **Step 1: Write money tests**

Create `tests/domain/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertCentPrice, assertPositiveQuantity, cents } from "@/domain/money";

describe("money helpers", () => {
  it("accepts integer cent amounts", () => {
    expect(cents(125)).toBe(125);
  });

  it("rejects non-integer cent amounts", () => {
    expect(() => cents(1.5)).toThrow("Money amounts must be integer cents");
  });

  it("accepts market prices from 1 to 99 cents", () => {
    expect(assertCentPrice(1)).toBe(1);
    expect(assertCentPrice(99)).toBe(99);
  });

  it("rejects invalid market prices", () => {
    expect(() => assertCentPrice(0)).toThrow("Price must be between 1 and 99 cents");
    expect(() => assertCentPrice(100)).toThrow("Price must be between 1 and 99 cents");
  });

  it("requires positive whole-share quantities", () => {
    expect(assertPositiveQuantity(3)).toBe(3);
    expect(() => assertPositiveQuantity(0)).toThrow("Quantity must be a positive integer");
    expect(() => assertPositiveQuantity(1.25)).toThrow("Quantity must be a positive integer");
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npm run test -- tests/domain/money.test.ts`

Expected: FAIL because `src/domain/money.ts` does not exist.

- [ ] **Step 3: Add domain primitives**

Create `src/domain/types.ts`:

```ts
export type UserRole = "USER" | "ADMIN";
export type UserStatus = "ACTIVE" | "INACTIVE";
export type MarketStatus = "OPEN" | "CLOSED" | "RESOLVED";
export type Outcome = "YES" | "NO";
export type Resolution = "YES" | "NO" | "CANCELLED";
export type OrderAction = "BUY" | "SELL";
export type OrderStatus = "OPEN" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED";

export type UserId = string;
export type MarketId = string;
export type OrderId = string;
export type TradeId = string;
```

Create `src/domain/errors.ts`:

```ts
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

export function domainError(code: string, message: string): DomainError {
  return new DomainError(message, code);
}
```

Create `src/domain/money.ts`:

```ts
import { domainError } from "./errors";

export type Cents = number;
export type Quantity = number;

export function cents(value: number): Cents {
  if (!Number.isInteger(value)) {
    throw domainError("INVALID_MONEY", "Money amounts must be integer cents");
  }
  return value;
}

export function assertCentPrice(value: number): Cents {
  if (!Number.isInteger(value) || value < 1 || value > 99) {
    throw domainError("INVALID_PRICE", "Price must be between 1 and 99 cents");
  }
  return value;
}

export function assertPositiveQuantity(value: number): Quantity {
  if (!Number.isInteger(value) || value <= 0) {
    throw domainError("INVALID_QUANTITY", "Quantity must be a positive integer");
  }
  return value;
}
```

- [ ] **Step 4: Run passing test**

Run: `npm run test -- tests/domain/money.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/domain/errors.ts src/domain/money.ts tests/domain/money.test.ts
git commit -m "feat: add domain primitives"
```

## Task 3: Pure Matching Engine

**Files:**
- Create: `src/domain/orderBook.ts`
- Test: `tests/domain/orderBook.test.ts`

- [ ] **Step 1: Write matching tests**

Create `tests/domain/orderBook.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { matchIncomingOrder, type BookOrder } from "@/domain/orderBook";

const baseOrder = (overrides: Partial<BookOrder>): BookOrder => ({
  id: "order",
  userId: "user",
  marketId: "market",
  outcome: "YES",
  action: "BUY",
  limitPrice: 50,
  remainingQuantity: 1,
  createdAtMs: 1,
  ...overrides,
});

describe("matchIncomingOrder", () => {
  it("creates primary YES/NO pairs when complementary buy limits sum to at least 100", () => {
    const resting = [baseOrder({ id: "yes-1", userId: "alice", outcome: "YES", action: "BUY", limitPrice: 63 })];
    const incoming = baseOrder({ id: "no-1", userId: "bob", outcome: "NO", action: "BUY", limitPrice: 40 });

    const result = matchIncomingOrder(incoming, resting);

    expect(result.fills).toEqual([
      {
        kind: "PRIMARY",
        restingOrderId: "yes-1",
        incomingOrderId: "no-1",
        quantity: 1,
        yesPrice: 63,
        noPrice: 37,
        yesBuyerUserId: "alice",
        noBuyerUserId: "bob",
      },
    ]);
    expect(result.incomingRemaining).toBe(0);
  });

  it("matches secondary same-outcome buy and sell orders at the resting price", () => {
    const resting = [baseOrder({ id: "sell-1", userId: "alice", outcome: "YES", action: "SELL", limitPrice: 58 })];
    const incoming = baseOrder({ id: "buy-1", userId: "bob", outcome: "YES", action: "BUY", limitPrice: 60 });

    const result = matchIncomingOrder(incoming, resting);

    expect(result.fills).toEqual([
      {
        kind: "SECONDARY",
        restingOrderId: "sell-1",
        incomingOrderId: "buy-1",
        quantity: 1,
        outcome: "YES",
        price: 58,
        buyerUserId: "bob",
        sellerUserId: "alice",
      },
    ]);
  });

  it("respects price-time priority for secondary fills", () => {
    const resting = [
      baseOrder({ id: "sell-old", userId: "alice", action: "SELL", limitPrice: 55, createdAtMs: 1 }),
      baseOrder({ id: "sell-better", userId: "carol", action: "SELL", limitPrice: 52, createdAtMs: 2 }),
    ];
    const incoming = baseOrder({ id: "buy", userId: "bob", action: "BUY", limitPrice: 60, remainingQuantity: 2 });

    const result = matchIncomingOrder(incoming, resting);

    expect(result.fills.map((fill) => fill.restingOrderId)).toEqual(["sell-better", "sell-old"]);
  });

  it("leaves unmatched quantity open", () => {
    const incoming = baseOrder({ id: "buy", remainingQuantity: 3 });

    const result = matchIncomingOrder(incoming, []);

    expect(result.fills).toEqual([]);
    expect(result.incomingRemaining).toBe(3);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npm run test -- tests/domain/orderBook.test.ts`

Expected: FAIL because `src/domain/orderBook.ts` does not exist.

- [ ] **Step 3: Implement matching engine**

Create `src/domain/orderBook.ts`:

```ts
import type { MarketId, OrderAction, OrderId, Outcome, UserId } from "./types";

export type BookOrder = {
  id: OrderId;
  userId: UserId;
  marketId: MarketId;
  outcome: Outcome;
  action: OrderAction;
  limitPrice: number;
  remainingQuantity: number;
  createdAtMs: number;
};

export type PrimaryFill = {
  kind: "PRIMARY";
  restingOrderId: OrderId;
  incomingOrderId: OrderId;
  quantity: number;
  yesPrice: number;
  noPrice: number;
  yesBuyerUserId: UserId;
  noBuyerUserId: UserId;
};

export type SecondaryFill = {
  kind: "SECONDARY";
  restingOrderId: OrderId;
  incomingOrderId: OrderId;
  quantity: number;
  outcome: Outcome;
  price: number;
  buyerUserId: UserId;
  sellerUserId: UserId;
};

export type OrderFill = PrimaryFill | SecondaryFill;

export function matchIncomingOrder(incoming: BookOrder, restingOrders: BookOrder[]) {
  const fills: OrderFill[] = [];
  let incomingRemaining = incoming.remainingQuantity;

  const candidates = restingOrders
    .filter((order) => order.marketId === incoming.marketId)
    .filter((order) => order.userId !== incoming.userId)
    .filter((order) => canMatch(incoming, order))
    .sort((a, b) => priority(incoming, a) - priority(incoming, b) || a.createdAtMs - b.createdAtMs);

  for (const resting of candidates) {
    if (incomingRemaining === 0) break;
    const quantity = Math.min(incomingRemaining, resting.remainingQuantity);
    fills.push(toFill(incoming, resting, quantity));
    incomingRemaining -= quantity;
  }

  return { fills, incomingRemaining };
}

function canMatch(incoming: BookOrder, resting: BookOrder): boolean {
  if (incoming.action === "BUY" && resting.action === "BUY" && incoming.outcome !== resting.outcome) {
    return incoming.limitPrice + resting.limitPrice >= 100;
  }
  if (incoming.outcome !== resting.outcome || incoming.action === resting.action) {
    return false;
  }
  const buyer = incoming.action === "BUY" ? incoming : resting;
  const seller = incoming.action === "SELL" ? incoming : resting;
  return buyer.limitPrice >= seller.limitPrice;
}

function priority(incoming: BookOrder, resting: BookOrder): number {
  if (incoming.action === "BUY" && resting.action === "BUY") {
    return -resting.limitPrice;
  }
  if (incoming.action === "BUY") {
    return resting.limitPrice;
  }
  return -resting.limitPrice;
}

function toFill(incoming: BookOrder, resting: BookOrder, quantity: number): OrderFill {
  if (incoming.action === "BUY" && resting.action === "BUY") {
    const restingPrice = resting.limitPrice;
    const incomingPrice = 100 - restingPrice;
    const yesOrder = incoming.outcome === "YES" ? incoming : resting;
    const noOrder = incoming.outcome === "NO" ? incoming : resting;
    return {
      kind: "PRIMARY",
      restingOrderId: resting.id,
      incomingOrderId: incoming.id,
      quantity,
      yesPrice: yesOrder.id === resting.id ? restingPrice : incomingPrice,
      noPrice: noOrder.id === resting.id ? restingPrice : incomingPrice,
      yesBuyerUserId: yesOrder.userId,
      noBuyerUserId: noOrder.userId,
    };
  }

  const buyer = incoming.action === "BUY" ? incoming : resting;
  const seller = incoming.action === "SELL" ? incoming : resting;
  return {
    kind: "SECONDARY",
    restingOrderId: resting.id,
    incomingOrderId: incoming.id,
    quantity,
    outcome: incoming.outcome,
    price: resting.limitPrice,
    buyerUserId: buyer.userId,
    sellerUserId: seller.userId,
  };
}
```

- [ ] **Step 4: Run passing test**

Run: `npm run test -- tests/domain/orderBook.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/orderBook.ts tests/domain/orderBook.test.ts
git commit -m "feat: add matching engine"
```

## Task 4: Prisma Schema And Seed Data

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `.env.example`
- Create: `src/server/db.ts`

- [ ] **Step 1: Create Prisma schema**

Create `prisma/schema.prisma` with models for `User`, `Market`, `MarketBlacklist`, `Order`, `Trade`, `Position`, `LedgerEntry`, and `AuditLog`. Use integer cents for all money fields and integer quantities for all share fields.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

enum UserRole {
  USER
  ADMIN
}

enum UserStatus {
  ACTIVE
  INACTIVE
}

enum MarketStatus {
  OPEN
  CLOSED
  RESOLVED
}

enum Outcome {
  YES
  NO
}

enum Resolution {
  YES
  NO
  CANCELLED
}

enum OrderAction {
  BUY
  SELL
}

enum OrderStatus {
  OPEN
  PARTIALLY_FILLED
  FILLED
  CANCELLED
}

model User {
  id               String     @id @default(cuid())
  name             String
  email            String     @unique
  role             UserRole   @default(USER)
  status           UserStatus @default(ACTIVE)
  availableCents   Int        @default(0)
  lockedCents      Int        @default(0)
  digestOptOut     Boolean    @default(false)
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
  orders           Order[]
  positions        Position[]
}

model Market {
  id                String       @id @default(cuid())
  question          String
  resolutionCriteria String
  closeTime         DateTime
  creatorId         String
  status            MarketStatus @default(OPEN)
  resolution        Resolution?
  resolutionNote    String?
  resolvedById      String?
  resolvedAt        DateTime?
  collateralCents   Int          @default(0)
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt
  orders            Order[]
  positions         Position[]
  blacklist         MarketBlacklist[]
}

model MarketBlacklist {
  marketId   String
  userId     String
  createdById String
  note       String?
  createdAt  DateTime @default(now())
  market     Market   @relation(fields: [marketId], references: [id])

  @@id([marketId, userId])
}

model Order {
  id                String      @id @default(cuid())
  marketId          String
  userId            String
  outcome           Outcome
  action            OrderAction
  limitPriceCents   Int
  originalQuantity  Int
  remainingQuantity Int
  lockedCents       Int         @default(0)
  lockedQuantity    Int         @default(0)
  status            OrderStatus @default(OPEN)
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  market            Market      @relation(fields: [marketId], references: [id])
  user              User        @relation(fields: [userId], references: [id])
}

model Trade {
  id              String   @id @default(cuid())
  marketId        String
  kind            String
  outcome         Outcome?
  quantity        Int
  yesPriceCents   Int?
  noPriceCents    Int?
  priceCents      Int?
  buyerUserId     String?
  sellerUserId    String?
  yesBuyerUserId  String?
  noBuyerUserId   String?
  createdAt       DateTime @default(now())
}

model Position {
  id              String  @id @default(cuid())
  userId          String
  marketId        String
  outcome         Outcome
  availableQuantity Int   @default(0)
  lockedQuantity  Int     @default(0)
  user            User    @relation(fields: [userId], references: [id])
  market          Market  @relation(fields: [marketId], references: [id])

  @@unique([userId, marketId, outcome])
}

model LedgerEntry {
  id            String   @id @default(cuid())
  userId        String?
  marketId      String?
  type          String
  amountCents   Int
  metadataJson  String
  createdAt     DateTime @default(now())
}

model AuditLog {
  id            String   @id @default(cuid())
  actorUserId   String?
  action        String
  entityType    String
  entityId      String?
  metadataJson  String
  createdAt     DateTime @default(now())
}
```

- [ ] **Step 2: Add Prisma client**

Create `.env.example`:

```dotenv
DATABASE_URL="file:./dev.db"
```

Create `src/server/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
```

- [ ] **Step 3: Add seed data**

Create `prisma/seed.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

await prisma.user.upsert({
  where: { email: "admin@example.com" },
  update: {},
  create: {
    name: "Admin",
    email: "admin@example.com",
    role: "ADMIN",
    availableCents: 10000,
  },
});

await prisma.user.upsert({
  where: { email: "friend@example.com" },
  update: {},
  create: {
    name: "Friend",
    email: "friend@example.com",
    role: "USER",
    availableCents: 10000,
  },
});

await prisma.$disconnect();
```

- [ ] **Step 4: Generate and migrate**

Run:

```bash
printf 'DATABASE_URL="file:./dev.db"\n' > .env
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
```

Expected: Prisma creates `prisma/dev.db`, migration files, and two seed users.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts prisma/migrations src/server/db.ts .env.example
git commit -m "feat: add database schema"
```

## Task 5: Ledger And Admin Adjustments

**Files:**
- Create: `src/server/audit.ts`
- Create: `src/server/ledger.ts`
- Test: `tests/server/ledger.test.ts`

- [ ] **Step 1: Write ledger service tests**

Create `tests/server/ledger.test.ts` with a test database setup that creates an admin and a user, credits the user, debits the user, and asserts both balances and ledger entries.

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { adjustUserBalance } from "@/server/ledger";

const prisma = new PrismaClient();

describe("adjustUserBalance", () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.ledgerEntry.deleteMany();
    await prisma.user.deleteMany();
  });

  it("lets admins credit and debit users with audit entries", async () => {
    const admin = await prisma.user.create({ data: { name: "Admin", email: "admin@test.dev", role: "ADMIN" } });
    const user = await prisma.user.create({ data: { name: "User", email: "user@test.dev", availableCents: 1000 } });

    await adjustUserBalance(prisma, { actorUserId: admin.id, targetUserId: user.id, amountCents: 250, note: "deposit" });
    await adjustUserBalance(prisma, { actorUserId: admin.id, targetUserId: user.id, amountCents: -100, note: "withdraw" });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const ledgerEntries = await prisma.ledgerEntry.findMany({ orderBy: { createdAt: "asc" } });
    const auditEntries = await prisma.auditLog.findMany();

    expect(updated.availableCents).toBe(1150);
    expect(ledgerEntries.map((entry) => entry.amountCents)).toEqual([250, -100]);
    expect(auditEntries).toHaveLength(2);
  });

  it("rejects non-admin adjustments", async () => {
    const actor = await prisma.user.create({ data: { name: "Actor", email: "actor@test.dev" } });
    const user = await prisma.user.create({ data: { name: "User", email: "user@test.dev" } });

    await expect(
      adjustUserBalance(prisma, { actorUserId: actor.id, targetUserId: user.id, amountCents: 100, note: "nope" }),
    ).rejects.toThrow("Only admins can adjust balances");
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npm run test -- tests/server/ledger.test.ts`

Expected: FAIL because `src/server/ledger.ts` does not exist.

- [ ] **Step 3: Implement audit helper and ledger adjustment**

Create `src/server/audit.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export async function audit(
  prisma: PrismaClient,
  input: {
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  return prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadataJson: JSON.stringify(input.metadata ?? {}),
    },
  });
}
```

Create `src/server/ledger.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { domainError } from "@/domain/errors";
import { audit } from "./audit";

export async function adjustUserBalance(
  prisma: PrismaClient,
  input: { actorUserId: string; targetUserId: string; amountCents: number; note: string },
) {
  return prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUniqueOrThrow({ where: { id: input.actorUserId } });
    if (actor.role !== "ADMIN") {
      throw domainError("UNAUTHORIZED_ADMIN_ACTION", "Only admins can adjust balances");
    }

    const target = await tx.user.findUniqueOrThrow({ where: { id: input.targetUserId } });
    if (target.availableCents + input.amountCents < 0) {
      throw domainError("INSUFFICIENT_BALANCE", "Adjustment would make available balance negative");
    }

    const updated = await tx.user.update({
      where: { id: input.targetUserId },
      data: { availableCents: { increment: input.amountCents } },
    });

    await tx.ledgerEntry.create({
      data: {
        userId: input.targetUserId,
        type: input.amountCents >= 0 ? "ADMIN_CREDIT" : "ADMIN_DEBIT",
        amountCents: input.amountCents,
        metadataJson: JSON.stringify({ note: input.note, actorUserId: input.actorUserId }),
      },
    });

    await audit(tx, {
      actorUserId: input.actorUserId,
      action: input.amountCents >= 0 ? "ADMIN_CREDIT" : "ADMIN_DEBIT",
      entityType: "User",
      entityId: input.targetUserId,
      metadata: { amountCents: input.amountCents, note: input.note },
    });

    return updated;
  });
}
```

- [ ] **Step 4: Run passing test**

Run: `npm run test -- tests/server/ledger.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/audit.ts src/server/ledger.ts tests/server/ledger.test.ts
git commit -m "feat: add ledger adjustments"
```

## Task 6: Markets, Blacklists, And Close-Time Handling

**Files:**
- Create: `src/server/markets.ts`
- Test: `tests/server/markets.test.ts`

- [ ] **Step 1: Write market service tests**

Create `tests/server/markets.test.ts` with these cases:

```ts
it("creates an open binary market with a future close time", async () => {
  const creator = await prisma.user.create({ data: { name: "Creator", email: "creator@test.dev" } });
  const market = await createMarket(prisma, {
    actorUserId: creator.id,
    question: "Will dinner happen?",
    resolutionCriteria: "Resolves YES if dinner happens before midnight.",
    closeTime: new Date(Date.now() + 86_400_000),
  });
  expect(market.status).toBe("OPEN");
  expect(market.question).toBe("Will dinner happen?");
});

it("blacklisting cancels the user's open orders and releases locked cash", async () => {
  const actor = await prisma.user.create({ data: { name: "Actor", email: "actor@test.dev" } });
  const user = await prisma.user.create({ data: { name: "User", email: "user@test.dev", availableCents: 1000 } });
  const market = await createMarket(prisma, {
    actorUserId: actor.id,
    question: "Will it rain?",
    resolutionCriteria: "YES if it rains.",
    closeTime: new Date(Date.now() + 86_400_000),
  });
  await placeLimitOrder(prisma, { userId: user.id, marketId: market.id, outcome: "YES", action: "BUY", limitPriceCents: 40, quantity: 5 });
  await addUserToMarketBlacklist(prisma, { actorUserId: actor.id, marketId: market.id, userId: user.id, note: "controls outcome" });
  const order = await prisma.order.findFirstOrThrow({ where: { userId: user.id, marketId: market.id } });
  const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(order.status).toBe("CANCELLED");
  expect(updatedUser.lockedCents).toBe(0);
  expect(updatedUser.availableCents).toBe(1000);
});

it("blacklisted active users can still resolve the market", async () => {
  const actor = await prisma.user.create({ data: { name: "Actor", email: "actor2@test.dev" } });
  const user = await prisma.user.create({ data: { name: "User", email: "user2@test.dev" } });
  const market = await createMarket(prisma, {
    actorUserId: actor.id,
    question: "Will the host arrive?",
    resolutionCriteria: "YES if host arrives.",
    closeTime: new Date(Date.now() + 86_400_000),
  });
  await addUserToMarketBlacklist(prisma, { actorUserId: actor.id, marketId: market.id, userId: user.id, note: "host controls outcome" });
  const resolved = await resolveMarket(prisma, { actorUserId: user.id, marketId: market.id, resolution: "YES", note: "I arrived" });
  expect(resolved.status).toBe("RESOLVED");
  expect(resolved.resolution).toBe("YES");
});
```

Add a `beforeEach` that deletes `auditLog`, `ledgerEntry`, `marketBlacklist`, `order`, `position`, `trade`, `market`, and `user` rows in dependency order.

- [ ] **Step 2: Run failing test**

Run: `npm run test -- tests/server/markets.test.ts`

Expected: FAIL because `src/server/markets.ts` does not exist.

- [ ] **Step 3: Implement market service**

Create `src/server/markets.ts` with exported functions:

```ts
export async function createMarket(prisma, input)
export async function addUserToMarketBlacklist(prisma, input)
export async function closeExpiredMarkets(prisma, now = new Date())
export async function resolveMarket(prisma, input)
```

Use these service contracts:

```ts
type CreateMarketInput = {
  actorUserId: string;
  question: string;
  resolutionCriteria: string;
  closeTime: Date;
};

type BlacklistInput = {
  actorUserId: string;
  marketId: string;
  userId: string;
  note: string;
};

type ResolveMarketInput = {
  actorUserId: string;
  marketId: string;
  resolution: "YES" | "NO" | "CANCELLED";
  note: string;
};
```

`createMarket` requires an active creator and a future close time. `addUserToMarketBlacklist` creates `MarketBlacklist`, cancels the target user's open orders for that market, releases locked cash and shares, and audits the action. `closeExpiredMarkets` marks expired `OPEN` markets as `CLOSED`, cancels all open orders, and audits each close. `resolveMarket` allows any active user, including blacklisted users, to resolve `OPEN` or `CLOSED` markets.

- [ ] **Step 4: Run passing test**

Run: `npm run test -- tests/server/markets.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/markets.ts tests/server/markets.test.ts
git commit -m "feat: add market lifecycle"
```

## Task 7: Orders, Locks, And Matching Orchestration

**Files:**
- Create: `src/server/orders.ts`
- Test: `tests/server/orders.test.ts`

- [ ] **Step 1: Write order service tests**

Create `tests/server/orders.test.ts` with one `describe("placeLimitOrder")` block and these exact test names:

```ts
it("locks cash for an unmatched buy order", async () => {});
it("locks owned shares for an unmatched sell order", async () => {});
it("rejects selling shares the user does not own", async () => {});
it("rejects orders from blacklisted users", async () => {});
it("matches complementary YES and NO buys into a fully backed pair", async () => {});
it("matches secondary same-outcome buy and sell orders", async () => {});
it("releases surplus locked cash when a buy fills below its limit", async () => {});
it("keeps a partially filled order open with the remaining quantity", async () => {});
```

Fill each test with seeded users and one seeded market. For the complementary-buy test, place a YES buy at `63` for Alice and a NO buy at `40` for Bob, then assert Alice has one YES share, Bob has one NO share, the market has `100` cents collateral, Alice spent `63`, and Bob spent `37`.

- [ ] **Step 2: Run failing test**

Run: `npm run test -- tests/server/orders.test.ts`

Expected: FAIL because `src/server/orders.ts` does not exist.

- [ ] **Step 3: Implement order service**

Create `src/server/orders.ts` with exported functions:

```ts
export async function placeLimitOrder(prisma, input)
export async function cancelOrder(prisma, input)
```

Use these service contracts:

```ts
type PlaceLimitOrderInput = {
  userId: string;
  marketId: string;
  outcome: "YES" | "NO";
  action: "BUY" | "SELL";
  limitPriceCents: number;
  quantity: number;
};

type CancelOrderInput = {
  actorUserId: string;
  orderId: string;
};
```

Validation order: market is `OPEN`, actor is active, actor is not blacklisted for order placement, price is `1..99`, quantity is a positive integer, and funds or shares are available. For buy orders, decrement user `availableCents` and increment `lockedCents`. For sell orders, decrement position `availableQuantity` and increment `lockedQuantity`. Load matchable resting orders and call `matchIncomingOrder`. For primary fills, move exactly `100 * quantity` cents into `market.collateralCents`, create YES/NO positions, release surplus locked cash, create trade rows, and update order statuses. For secondary fills, transfer cash to seller, transfer shares to buyer, release surplus locked cash, create trade rows, and update order statuses. `cancelOrder` only lets the owner cancel open or partially filled orders, then releases remaining locks.

- [ ] **Step 4: Run passing test**

Run: `npm run test -- tests/server/orders.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/orders.ts tests/server/orders.test.ts
git commit -m "feat: add order placement and matching"
```

## Task 8: Settlement And Corrections

**Files:**
- Create: `src/domain/settlement.ts`
- Modify: `src/server/markets.ts`
- Test: `tests/domain/settlement.test.ts`
- Test: `tests/server/settlement.test.ts`

- [ ] **Step 1: Write settlement tests**

Domain tests:

- YES resolution pays YES `100` and NO `0`.
- NO resolution pays NO `100` and YES `0`.
- CANCELLED pays both outcomes `50`.

Server tests:

- Early resolution cancels open orders, releases locks, pays winners, zeroes market collateral, and marks market `RESOLVED`.
- Natural close blocks new orders, then later resolution settles.
- Admin correction creates reversal entries and a second resolution audit entry.

- [ ] **Step 2: Run failing tests**

Run:

```bash
npm run test -- tests/domain/settlement.test.ts tests/server/settlement.test.ts
```

Expected: FAIL because settlement functions are missing.

- [ ] **Step 3: Implement settlement**

Create `src/domain/settlement.ts`:

```ts
import type { Outcome, Resolution } from "./types";

export function payoutCentsPerShare(resolution: Resolution, outcome: Outcome): number {
  if (resolution === "CANCELLED") return 50;
  return resolution === outcome ? 100 : 0;
}
```

Modify `resolveMarket` in `src/server/markets.ts`:

- Cancel open orders first.
- For each position, pay `availableQuantity + lockedQuantity` times `payoutCentsPerShare`.
- Decrement `market.collateralCents` by total payouts.
- Set positions to zero.
- Mark market `RESOLVED`.
- Create ledger and audit entries.

- [ ] **Step 4: Run passing tests**

Run:

```bash
npm run test -- tests/domain/settlement.test.ts tests/server/settlement.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/settlement.ts src/server/markets.ts tests/domain/settlement.test.ts tests/server/settlement.test.ts
git commit -m "feat: add market settlement"
```

## Task 9: Email Digest Plumbing

**Files:**
- Create: `src/server/emailAdapter.ts`
- Create: `src/server/emailDigest.ts`
- Test: `tests/server/emailDigest.test.ts`

- [ ] **Step 1: Write digest tests**

Create `tests/server/emailDigest.test.ts` with this concrete fake adapter and assertion shape:

```ts
const sent: EmailMessage[] = [];
const fakeEmail: EmailAdapter = {
  async send(message) {
    sent.push(message);
  },
};

it("sends active market digests only to eligible users", async () => {
  await prisma.user.create({ data: { name: "Active", email: "active@test.dev", status: "ACTIVE" } });
  await prisma.user.create({ data: { name: "Inactive", email: "inactive@test.dev", status: "INACTIVE" } });
  await prisma.user.create({ data: { name: "Opted Out", email: "optout@test.dev", status: "ACTIVE", digestOptOut: true } });
  await prisma.market.create({
    data: {
      creatorId: "seed",
      question: "Open market?",
      resolutionCriteria: "YES if visible.",
      closeTime: new Date(Date.now() + 86_400_000),
      status: "OPEN",
    },
  });
  await sendActiveMarketDigests(prisma, fakeEmail);
  expect(sent.map((message) => message.to)).toEqual(["active@test.dev"]);
  expect(sent[0].text).toContain("Open market?");
});
```

- [ ] **Step 2: Run failing test**

Run: `npm run test -- tests/server/emailDigest.test.ts`

Expected: FAIL because digest modules do not exist.

- [ ] **Step 3: Implement digest service**

Create `src/server/emailAdapter.ts`:

```ts
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type EmailAdapter = {
  send(message: EmailMessage): Promise<void>;
};

export const consoleEmailAdapter: EmailAdapter = {
  async send(message) {
    console.info(JSON.stringify({ type: "email", message }));
  },
};
```

Create `src/server/emailDigest.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import type { EmailAdapter } from "./emailAdapter";
import { audit } from "./audit";

export async function sendActiveMarketDigests(prisma: PrismaClient, email: EmailAdapter) {
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", digestOptOut: false, email: { not: "" } },
  });
  const markets = await prisma.market.findMany({
    where: { status: "OPEN" },
    orderBy: { closeTime: "asc" },
  });

  for (const user of users) {
    const text = markets.length
      ? markets.map((market) => `- ${market.question} closes ${market.closeTime.toISOString()}`).join("\n")
      : "No open markets right now.";

    await email.send({
      to: user.email,
      subject: "Active FriendlyFire markets",
      text,
    });

    await audit(prisma, {
      actorUserId: user.id,
      action: "EMAIL_DIGEST_SENT",
      entityType: "User",
      entityId: user.id,
      metadata: { marketCount: markets.length },
    });
  }
}
```

- [ ] **Step 4: Run passing test**

Run: `npm run test -- tests/server/emailDigest.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/emailAdapter.ts src/server/emailDigest.ts tests/server/emailDigest.test.ts
git commit -m "feat: add active market digests"
```

## Task 10: Minimal UI And Server Actions

**Files:**
- Create: `src/app/actions.ts`
- Modify: `src/app/page.tsx`
- Create: `src/app/markets/[marketId]/page.tsx`
- Create: `src/app/admin/page.tsx`
- Create: `src/app/styles.css`

- [ ] **Step 1: Add server actions**

Create `src/app/actions.ts` wrapping service calls:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { adjustUserBalance } from "@/server/ledger";
import { createMarket, addUserToMarketBlacklist, resolveMarket } from "@/server/markets";
import { cancelOrder, placeLimitOrder } from "@/server/orders";

const demoActorId = async () => (await db.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } })).id;

export async function createMarketAction(formData: FormData) {
  await createMarket(db, {
    actorUserId: await demoActorId(),
    question: String(formData.get("question")),
    resolutionCriteria: String(formData.get("resolutionCriteria")),
    closeTime: new Date(String(formData.get("closeTime"))),
  });
  revalidatePath("/");
}

export async function placeOrderAction(formData: FormData) {
  await placeLimitOrder(db, {
    userId: String(formData.get("userId")),
    marketId: String(formData.get("marketId")),
    outcome: String(formData.get("outcome")) as "YES" | "NO",
    action: String(formData.get("action")) as "BUY" | "SELL",
    limitPriceCents: Number(formData.get("limitPriceCents")),
    quantity: Number(formData.get("quantity")),
  });
  revalidatePath(`/markets/${String(formData.get("marketId"))}`);
}

export async function cancelOrderAction(formData: FormData) {
  await cancelOrder(db, { actorUserId: String(formData.get("userId")), orderId: String(formData.get("orderId")) });
  revalidatePath(`/markets/${String(formData.get("marketId"))}`);
}

export async function resolveMarketAction(formData: FormData) {
  await resolveMarket(db, {
    actorUserId: String(formData.get("userId")),
    marketId: String(formData.get("marketId")),
    resolution: String(formData.get("resolution")) as "YES" | "NO" | "CANCELLED",
    note: String(formData.get("note") ?? ""),
  });
  revalidatePath(`/markets/${String(formData.get("marketId"))}`);
}

export async function adjustBalanceAction(formData: FormData) {
  await adjustUserBalance(db, {
    actorUserId: String(formData.get("actorUserId")),
    targetUserId: String(formData.get("targetUserId")),
    amountCents: Number(formData.get("amountCents")),
    note: String(formData.get("note")),
  });
  revalidatePath("/admin");
}

export async function blacklistUserAction(formData: FormData) {
  await addUserToMarketBlacklist(db, {
    actorUserId: String(formData.get("actorUserId")),
    marketId: String(formData.get("marketId")),
    userId: String(formData.get("userId")),
    note: String(formData.get("note") ?? ""),
  });
  revalidatePath(`/markets/${String(formData.get("marketId"))}`);
}
```

- [ ] **Step 2: Build pages**

Create pages with these visible sections:

- `/`: heading `FriendlyFire`, open markets list, create-market form, and user balances table.
- `/markets/[marketId]`: market question, resolution criteria, order book, order form, open orders table, recent trades table, positions table, blacklist form, and resolution form.
- `/admin`: users table and balance-adjustment form.

Use server components and plain forms. The first UI uses user selectors instead of login so local testing can exercise all flows. Every mutation form posts to a server action in `src/app/actions.ts`.

- [ ] **Step 3: Run app**

Run: `npm run dev`

Expected: app starts on `http://localhost:3000`.

- [ ] **Step 4: Manual smoke test**

In the browser:

- Create a market.
- Place a YES buy from one user.
- Place a complementary NO buy from another user.
- Confirm positions appear.
- Resolve the market.
- Confirm winner balance increases.

- [ ] **Step 5: Commit**

```bash
git add src/app
git commit -m "feat: add minimal market UI"
```

## Task 11: Final Verification

**Files:**
- Modify the smallest set of files needed to fix verification failures.

- [ ] **Step 1: Run full tests**

Run: `npm run test`

Expected: PASS.

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Run Prisma validation**

Run: `npx prisma validate`

Expected: Prisma schema validates.

- [ ] **Step 4: Review audit and zero-sum invariants**

Run targeted tests for ledger, orders, and settlement:

```bash
npm run test -- tests/server/ledger.test.ts tests/server/orders.test.ts tests/server/settlement.test.ts
```

Expected: PASS, including zero-sum invariant assertions.

- [ ] **Step 5: Commit verification fixes**

When files changed during verification:

```bash
git add .
git commit -m "fix: complete mvp verification"
```

If no files changed, do not create an empty commit.

## Self-Review Notes

- Spec coverage: the plan covers users, admin balances, binary markets, blacklists, limit orders, complementary primary issuance, secondary trading, close time, early resolution, cancelled resolution, email digests, audit log, and tests.
- Deliberate simplification: authentication is deferred in favor of local user selectors because the spec still has authentication method as an open implementation decision. The domain services are written so real auth can pass the authenticated user id later.
- Blacklist correction: blacklisted users are blocked from trading but remain allowed to resolve markets, matching the approved spec.
- Zero-sum accounting: primary issuance creates exactly one YES and one NO share from exactly `100` cents of user collateral; cancelled markets pay `50` cents to each side.
