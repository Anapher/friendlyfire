# Private Prediction Market Design

## Summary

Build a private prediction-market web app for one trusted friend group. Users create binary probability markets, trade explicit YES and NO shares through a central limit order book, and settle real-money-denominated balances inside the app. The app does not process payments in v1; admins manually credit and debit user balances when friends settle up outside the app.

The platform itself never takes risk, never provides liquidity, and should remain zero-sum. All trades, balance changes, market changes, blacklist actions, and resolutions are recorded in an audit log.

## Goals

- Let trusted users create binary markets with clear resolution criteria and close times.
- Let users trade YES and NO shares with limit orders only.
- Track real-money-denominated internal balances without payment integration.
- Keep accounting zero-sum through explicit cash locks, share locks, trades, and settlement entries.
- Allow new YES/NO share pairs to be created only when opposing buyers fully fund a pair together.
- Allow admins to manually add or remove funds from user accounts.
- Allow any user to resolve a market, including before close time.
- Allow per-market blacklists that take effect immediately.
- Send regular email digests about active markets.

## Non-Goals

- Public markets.
- Multiple groups or leagues.
- Payment processing.
- Blockchain or on-chain settlement.
- Automated market maker liquidity.
- Market orders.
- Short-selling.
- Multi-outcome markets.
- Comments, chat, or social feeds.
- Push notifications.

## Users And Access

Each user has:

- Name.
- Email address.
- Role: regular user or admin.
- Account status: active or inactive.
- Available cash balance.
- Locked cash balance.
- Email digest preference.

Admins can manually credit or debit user balances. Every admin adjustment must include an audit entry with actor, target user, amount, direction, timestamp, and optional note.

The first version assumes one private group. Multi-group behavior is out of scope for v1.

## Markets

Each market is binary and has:

- Question.
- Description or context.
- Resolution criteria.
- Close time.
- Creator.
- Status.
- Resolved outcome, if any.
- Resolution note, if any.
- Per-market blacklist.

Market statuses:

- `OPEN`: trading is allowed for eligible users.
- `CLOSED`: trading has stopped because close time passed, but the market is not settled yet.
- `RESOLVED`: the market has settled as `YES`, `NO`, or `CANCELLED`.

A market can be resolved before close time. Early resolution immediately stops trading, cancels all remaining open orders, releases locked funds or shares, and settles positions in the same transaction.

When close time passes naturally, trading stops and open orders are cancelled. The market remains `CLOSED` until a user resolves it.

## Blacklists

Each market can blacklist users. A blacklisted user:

- Cannot place new orders on that market.
- Has all open orders on that market cancelled immediately when blacklisted.
- Keeps already-filled positions, which settle normally.
- May still view the market for transparency.

Blacklist changes must be audited with actor, target user, market, timestamp, and optional note.

## Trading Model

The app uses explicit YES and NO positions.

Users place limit orders with:

- Market.
- Outcome: `YES` or `NO`.
- Action: `BUY` or `SELL`.
- Limit price in cents from `1` to `99`.
- Quantity in whole shares.

Each winning share pays `100` cents at settlement. Prices and balances use integer cents. Share quantities use integer units in v1.

Short-selling is not supported. Users may only sell shares they already own. New shares are created by matching complementary buy orders: one user buys YES, another user buys NO, and together they fund one fully backed YES/NO pair.

## Order Locking

Orders reserve collateral immediately:

- A buy order locks `price * quantity` cents from the user's available balance.
- A sell order locks the shares being sold from the user's available position.
- Cancelling an order releases its remaining locked cash or shares.
- Filled portions consume the corresponding locked cash or shares.
- If a buy order executes below its limit price, the surplus locked cash for that filled quantity is released.

The backend must reject order placement if the user lacks available cash or available shares.

## Matching

The matching engine is a single coherent engine for binary outcome orders, not two independent books.

There are two fill paths.

First, primary issuance matches complementary buy orders. A YES buy order can match a NO buy order when their limit prices sum to at least `100` cents. The resting order receives its limit price, and the incoming order receives the complementary price so that the two executed prices sum to exactly `100` cents. For example, if a resting YES buy is priced at `63` cents, an incoming NO buy can match at `37` cents if its limit is at least `37`. The fill creates one YES share for the YES buyer and one NO share for the NO buyer for each matched unit.

Second, secondary trading matches buy and sell orders for the same market and same outcome. A trade executes when the buyer's limit price is greater than or equal to the seller's limit price. Trades execute at the resting order's price. The buyer receives existing shares; the seller receives cash.

Partially filled orders remain open for the remaining quantity.

Matching must respect price-time priority:

- Better prices match first.
- For equal prices, older resting orders match first.

The market headline probability is based on the YES side, using the best available YES price when possible, otherwise the last traded YES price, otherwise no displayed probability.

## Positions

Each user has per-market YES and NO share balances:

- Available YES shares.
- Locked YES shares.
- Available NO shares.
- Locked NO shares.

Buying shares increases the buyer's position. In primary issuance, complementary buyers receive newly created YES and NO shares that are fully backed by their combined `100` cents per pair. In secondary trading, the buyer receives existing shares from the seller. Selling shares decreases the seller's position when the trade fills. Locked shares cannot be sold again until an order is cancelled or filled.

## Ledger

The ledger is the source of truth for user money. It should be append-only, with derived balances computed from ledger entries or maintained with transactional consistency.

Ledger entries cover:

- Admin credits and debits.
- Cash locked for buy orders.
- Cash released from cancelled or expired buy orders.
- Cash spent on filled buy orders.
- Cash received from filled sell orders.
- Fully backed YES/NO pair creation from complementary buy fills.
- Market collateral held for outstanding YES/NO pairs.
- Settlement payouts.
- Cancellation refunds.
- Correction entries.

The exchange itself has no spendable balance and never takes a trading position. Market collateral is user-funded settlement backing, not platform money. The invariant is that user value moves between users, between available and locked states, or into and out of market collateral; the app does not create profit for itself.

Every outstanding YES/NO pair must be fully backed by `100` cents of user-funded collateral. Primary issuance creates one YES and one NO share only when the two buyers together pay exactly `100` cents. Secondary trading transfers existing shares and cash between users without changing total outstanding shares.

## Resolution And Settlement

Any active user may resolve a market as:

- `YES`.
- `NO`.
- `CANCELLED`.

Resolution records actor, timestamp, outcome, and optional note.

For a `YES` resolution:

- YES shares pay `100` cents each.
- NO shares pay `0`.

For a `NO` resolution:

- NO shares pay `100` cents each.
- YES shares pay `0`.

For a `CANCELLED` resolution:

- YES shares pay `50` cents each.
- NO shares pay `50` cents each.
- This keeps each outstanding YES/NO pair redeemable for exactly `100` cents and avoids non-zero-sum refunds after secondary trading.

Before settlement, all open orders on the market are cancelled and remaining locks are released. Settlement and order cancellation must occur atomically.

Because resolution is trust-based, the app also needs an admin correction path. Admins may reverse and re-resolve a market when needed. Corrections must be represented as explicit reversal ledger entries and audit-log entries rather than editing historical records in place.

## Email Digests

A scheduled job sends regular emails to eligible users about active markets.

Recipients:

- Active users.
- Users with a valid email address.
- Users who have not opted out of digests.

Digest content:

- Open markets.
- Close times.
- Headline probabilities.
- Recent trades.
- The recipient's positions.
- Markets nearing close.

Inactive accounts, opted-out users, and users without valid email addresses are skipped.

## Audit Log

The audit log records sensitive or consequential actions:

- Admin balance adjustments.
- Market creation and edits.
- Order placement.
- Order cancellation.
- Trade execution.
- Blacklist changes.
- Market close transitions.
- Market resolution.
- Admin correction and re-resolution.
- Email digest send attempts and failures.

Audit entries include actor, action type, affected entity, timestamp, and structured metadata.

## Backend Responsibilities

The backend is the source of truth for:

- Authentication and authorization.
- User profiles and roles.
- Balances and ledger entries.
- Order validation.
- Matching.
- Position accounting.
- Market lifecycle transitions.
- Blacklist enforcement.
- Resolution and settlement.
- Email digest scheduling.
- Audit logging.

The exchange domain logic should live in isolated services that can be tested without the UI or email system.

## Frontend Responsibilities

The frontend should make the app feel like a friendly private exchange, not a professional trading terminal.

Primary screens:

- Market list with active markets, close times, and headline probabilities.
- Market detail with question, criteria, order book, trading form, recent trades, positions, and blacklist state.
- Create market form.
- User balance and positions page.
- Admin user-management and balance-adjustment page.

The UI may show the market probability prominently as the YES price while still letting users explicitly buy or sell YES and NO shares.

## Error Handling

The backend rejects invalid actions with clear domain errors:

- Insufficient available balance.
- Insufficient available shares.
- Market closed or resolved.
- User blacklisted from market.
- Invalid price.
- Invalid quantity.
- Duplicate resolution.
- Inactive account.
- Unauthorized admin action.

Order placement, matching, blacklist cancellation, market closing, and resolution must run inside database transactions with row-level locking or equivalent safeguards.

## Testing Strategy

Domain tests should cover:

- Users cannot spend unavailable balance.
- Users cannot sell shares they do not own.
- Buy orders lock cash.
- Sell orders lock shares.
- Cancelling orders releases remaining locked cash or shares.
- Matching respects price-time priority.
- Complementary YES and NO buy orders can create fully backed share pairs.
- Complementary buy fills execute at prices that sum to exactly `100` cents.
- Partial fills leave correct remaining order quantities.
- Trade ledger entries and position changes are balanced.
- The app remains zero-sum after trades, cancellations, blacklists, close-time transitions, and resolution.
- Early resolution cancels open orders and settles positions atomically.
- Natural close time cancels open orders and blocks new trading.
- Blacklisting immediately cancels open orders but preserves filled positions.
- Blacklisted users cannot trade or resolve that market.
- Cancelled markets pay `50` cents per outstanding YES or NO share.
- Admin corrections create reversal entries instead of mutating history.
- Email digests include only eligible recipients and active-market content.

Integration tests should cover the most important user flows:

- Create market, place crossing orders, fill trade, resolve YES.
- Create market, place non-crossing orders, close naturally, resolve NO.
- Blacklist a user with open orders and existing positions.
- Admin adjusts balances and audit entries are created.

## Open Decisions For Implementation Planning

- Exact tech stack.
- Authentication method.
- Email provider.
- Digest schedule.
- Whether market creators can edit markets after creation.
- Whether users can opt out of all emails or only digest emails.
- Whether a `CANCELLED` market is common enough to expose prominently in the UI.
