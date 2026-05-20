# Mobile-first UI redesign

Date: 2026-05-20
Status: Approved (design)

## Goal

Make FriendlyFire usable on a phone first. Today the app is desktop-only:
dense tables, 3–6-column form grids, 14px base font, 34px tap targets. The
single fallback `@media (max-width: 900px)` rule just collapses grids and
turns every `<section>` into a horizontal-scroll container, which makes
the order book and open-orders tables unusable on mobile.

The redesign is mobile-first; desktop is the wider variant of the same
components, not a separate layout.

## Non-goals

- Changing data model, server actions, routes, or domain logic.
- Adding real-time features (websockets, push notifications).
- Theming / dark mode (keep the current teal palette).
- Replacing magic-link auth.
- Charts / market history visualisation.

## Approach

Approach B from brainstorming: **Tailwind CSS v4 + Radix UI Primitives**
(unstyled headless components, wrapped in thin local components). No
component-library kit (no shadcn-cli, no Radix Themes, no Mantine).

Rationale: the pain is layout (tables don't fit, forms are too wide) plus
a few interactions that benefit from accessible primitives (drawer, dialog,
tabs, dropdown). Tailwind handles the layout half; Radix Primitives handle
the interaction half. The codebase is small enough that the rewrite cost
is bounded.

## Stack changes

Added dependencies:

- `tailwindcss@^4` + `@tailwindcss/postcss`
- `@radix-ui/react-dialog`
- `@radix-ui/react-dropdown-menu`
- `@radix-ui/react-tabs`
- `@radix-ui/react-toast`
- `@radix-ui/react-select`
- `lucide-react`
- `clsx`
- `tailwind-merge`

Files added:

- `postcss.config.mjs`
- `tailwind.config.ts` (minimal — content globs only)
- `src/app/globals.css` (Tailwind directives + `@theme` tokens)
- `src/app/_ui/` — local component wrappers (see below)
- `src/lib/cn.ts` — `cn = (...args) => twMerge(clsx(args))`

Files removed:

- `src/app/styles.css`
- All references to `.form-grid`, `.compact-form`, `.single-column`,
  `.span-2`, `.span-3`, `.two-column`, `.market-summary`, `.signed-in`,
  `.page-header`, `.auth-main`, `.auth-panel`, `.checkbox-label`,
  `.notice`, `.error` — replaced by primitives or Tailwind utilities.

Files changed: every page under `src/app/` (4 pages + layout).

## Tokens

Set in `globals.css` via Tailwind v4 `@theme`:

```
--color-bg: #f7f8fa
--color-panel: #ffffff
--color-line: #d8dee8
--color-line-strong: #b8c0cc
--color-text: #17202a
--color-muted: #637083
--color-accent: #0f766e
--color-accent-strong: #115e59
--color-danger: #9f1239
--color-success: #065f46
--color-overlay: rgb(0 0 0 / 0.4)

--radius: 0.5rem
--radius-lg: 0.75rem
```

Typography: base 16px; numeric content uses Tailwind `font-mono`.
Headings: h1 24/28, h2 18, h3 15.

Tap targets: every input/button/clickable list row is `min-h-11` (44px)
or taller.

Breakpoints (Tailwind defaults): `sm 640`, `md 768`, `lg 1024`.

## Local component wrappers (`src/app/_ui/`)

All are client components (`"use client"`). Pages stay server components
and import these. Wrappers are intentionally minimal — they style and
compose Radix, they do not own state beyond what Radix already manages.

- `Button.tsx` — variants: `primary` | `secondary` (outline) | `ghost`
  | `danger`. Always `min-h-11`. Full-width by default on `<sm`, auto
  inside flex rows.
- `Card.tsx` — bordered panel, padding scales with breakpoint.
- `Field.tsx` — label + input/select/textarea wrapper. Label above input.
- `Form.tsx` — vertical stack on mobile, optional 2-col grid on `md:`.
- `PageHeader.tsx` — title, optional subtitle, optional back-chevron,
  right-slot for user menu / actions.
- `TopBar.tsx` — sticky `h-14`/`md:h-16` app bar, blurred background.
  Holds brand link + user menu (DropdownMenu on `<md`, inline items on
  `md:`).
- `Drawer.tsx` — wraps Radix Dialog with bottom-sheet styling on `<md`,
  centered modal on `md:`. Used for "Place order", "New market",
  "New user", "Adjust balance".
- `AlertDialog.tsx` — destructive-action confirm (cancel order, resolve
  market, blacklist user).
- `Tabs.tsx` — Radix Tabs styled as a segmented bar; scroll-snap row on
  narrow viewports.
- `Toast.tsx` — Radix Toast for transient feedback (e.g. "Login link
  sent"). Mounted once in `layout.tsx`.
- `Select.tsx` — wraps Radix Select for the high-value, styled
  selects (resolution outcome, target user). Native `<select>` is kept
  for low-value lists (digest opt-out etc.).
- `Segmented.tsx` — two- or three-way segmented control (radio-group
  semantics). Used for Outcome (YES/NO) and Side (BUY/SELL) in the order
  form.
- `Badge.tsx` — small status pill (market status, position outcome).
- `StickyActionBar.tsx` — fixed-bottom slot on `<md` (backdrop-blurred),
  inline on `md:`.
- `ResponsiveTable.tsx` — see "Universal table → card" below.
- `OrderBookLadder.tsx` — bespoke; not part of the table system.

## Universal table → card

`ResponsiveTable<Row>` props:

```ts
type Column<Row> = {
  key: string;
  label: string;
  render: (row: Row) => ReactNode;
  priority: "primary" | "secondary" | "desktop-only";
};
```

Render rules:

- `<md`: a list of `<Card>` rows. `primary` columns stack at the top
  (label hidden, render output emphasised). `secondary` columns render
  as label-value pairs in a muted row below. `desktop-only` columns are
  not rendered.
- `≥md`: a real `<table>` showing every column.

Tables migrated to `ResponsiveTable`:

- Home: Open Markets, User Balances.
- Market detail: Open Orders, Recent Trades, Positions, Blacklist.
- Admin: Users.

The order book is not a table — it uses `OrderBookLadder`.

## Page-by-page changes

### Top-level layout (`src/app/layout.tsx`)

- Imports `globals.css` instead of `styles.css`.
- Mounts `<TopBar>` and the Radix Toast viewport at the root.
- `<body>` gets `min-h-dvh bg-bg text-text font-sans antialiased`.

### Login (`/login`)

- `<main>` becomes `min-h-dvh grid place-items-center px-4`.
- Card capped at `max-w-sm`.
- Email input is taller (`h-12`) and uses `inputMode="email"`.
- `sent` / `error` query params render as Radix Toasts in addition to an
  inline status banner (so post-submit re-renders don't lose feedback).
  The banner uses Tailwind utilities (`bg-success/10 text-success` and
  `bg-danger/10 text-danger`) — the old `.notice` / `.error` classes
  are removed.
- No structural change to the form action.

### Home (`/`)

- `<TopBar>` (brand + user menu) replaces the inline header.
- `<PageHeader title="Open Markets" />` with a `+ New market` button on
  the right that opens the **New market** Drawer.
- Open Markets renders as a **list of `MarketCard`s** on `<md`:
  - Title (`h3`, two-line clamp), tap target is the whole card.
  - Muted row: creator name · close-time (relative + tooltip absolute).
  - `<Badge>` for status.
  - Collateral hidden by default; revealed via small "Details" inline
    disclosure.
  - 2-column grid of the same cards on `md:`. No table form on desktop.
- User Balances:
  - `<md`: collapsed behind a "Show user balances" Collapsible.
  - `md:`–`lg:`: card list via `ResponsiveTable`.
  - `lg:`: real table.

### Market detail (`/markets/[id]`)

Header: `<PageHeader back="/" title={market.question} />`. The brand
"FriendlyFire" link moves up into `<TopBar>`.

Body is a **`<Tabs>`** component with four tabs:

1. **Trade** (default):
   - Market summary `<Card>`: status badge, close time, collateral,
     creator. Resolution criteria in a "Read more" Collapsible.
   - "Your positions" card (current user only), YES/NO chips with
     available/locked quantities.
   - Primary CTA `Place order` opens the **Order entry Drawer** on
     `<md` (sticky in `StickyActionBar` while the tab is active).
   - Your open orders below the CTA, as `<Card>`s with a Cancel button
     gated by `AlertDialog`.
2. **Book**:
   - `<OrderBookLadder>` — YES/NO twin ladder. Each price row is tappable
     and pre-fills the order entry Drawer with that price, outcome, and
     the opposite side. Best bid/ask highlighted.
3. **Activity**:
   - Recent trades (20) via `ResponsiveTable`. On `<md` each trade is a
     card: time + kind badge on the top row, outcome × qty × price on
     the second row, participants muted below.
4. **Manage** (creator or admin only — tab hidden otherwise):
   - All positions (`ResponsiveTable`).
   - Blacklist add-form and list (`ResponsiveTable`).
   - Resolve form: `<Segmented>` for YES/NO/CANCELLED + note + destructive
     submit gated by `AlertDialog`.
   - Admin correction form: identical layout, only when
     `status === "RESOLVED"` and role is admin.

Order entry Drawer (the single most-important mobile interaction):

- Outcome: `<Segmented>` YES/NO.
- Side: `<Segmented>` BUY/SELL.
- Limit price: numeric input, suffix "¢", helper text shows max payout.
- Quantity: numeric input.
- Full-width primary submit at the bottom of the sheet.

Desktop (`lg:`) layout for the Trade tab splits left/right: ladder on the
left, inline order form on the right (no drawer, but the Drawer component
still works on `md`).

### Admin (`/admin`)

- `<PageHeader back="/" title="Admin" subtitle="Users and balance adjustments" />`.
- Users via `ResponsiveTable`:
  - `<md`: card per user (name + email line, role + status chips,
    available/locked figures, digest state, "Adjust balance" button on
    the card).
  - `lg:`: full 8-column table.
- "Create User" form replaced by a `+ New user` button that opens a
  Drawer with the same fields.
- "Adjust Balance": the page-wide shared form is removed. Each user card
  / row has an "Adjust balance" button that opens a Drawer pre-filled
  with `targetUserId`.

## Accessibility

- All Radix primitives provide ARIA semantics out of the box.
- Focus rings preserved (Tailwind's `ring` utilities; no `outline: none`).
- Tap targets `≥ 44px`.
- Color contrast for `text` on `bg`, `muted` on `panel`, and `danger` on
  `panel` checked against WCAG AA (current palette already passes).
- `inputMode` attributes set on numeric inputs (price, quantity, cents).
- Forms remain progressive-enhancement-friendly: `<form action={…}>`
  server actions still work without JS; Drawers degrade to inline forms
  if JS is off (the Drawer wrapper falls back to a `<details>` element
  when uncontrolled and JS-less — implementation-level detail).

## Testing

- Existing Vitest suite continues to pass (no domain or server-action
  changes).
- New component tests (Vitest + Testing Library) for:
  - `ResponsiveTable` row → card behavior across breakpoints (via
    `matchMedia` mock).
  - `OrderBookLadder` aggregation and tap-to-prefill payload.
  - `Segmented` keyboard navigation.
- Visual smoke check at 375×812 (iPhone 12), 414×896, 768, 1024, 1440
  viewports for every page.

## Migration / rollout

Single PR. No feature flag — the redesign replaces the existing CSS
wholesale. The old `styles.css` is deleted in the same commit that
introduces `globals.css`. No data migration.

## Risks

- Tailwind v4 is a recent major; PostCSS plugin wiring with Next 15 needs
  verification. Mitigation: a smoke commit that just adds Tailwind and
  renders a single styled element before any pages are touched.
- Radix Toast viewport must be mounted exactly once at the root layout
  (client component). Verified during implementation.
- The order entry Drawer is JS-dependent; the inline fallback handled
  via `<details>` element keeps the page usable without JS.
