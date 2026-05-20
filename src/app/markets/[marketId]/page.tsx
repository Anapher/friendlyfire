import Link from "next/link";
import { notFound } from "next/navigation";
import {
  blacklistUserAction,
  cancelOrderAction,
  correctMarketResolutionAction,
  logoutAction,
  placeOrderAction,
  resolveMarketAction,
} from "../../actions";
import { requireCurrentUser } from "@/server/auth";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

type MarketPageProps = {
  params: Promise<{ marketId: string }>;
};

function money(cents: number | null) {
  if (cents === null) {
    return "-";
  }
  return `$${(cents / 100).toFixed(2)}`;
}

function userLabel(user?: { name: string } | null) {
  return user?.name ?? "-";
}

function summarizeBook(
  orders: Array<{
    outcome: string;
    action: string;
    limitPriceCents: number;
    remainingQuantity: number;
  }>,
) {
  const levels = new Map<string, { outcome: string; action: string; price: number; quantity: number }>();
  for (const order of orders) {
    const key = `${order.outcome}:${order.action}:${order.limitPriceCents}`;
    const level =
      levels.get(key) ??
      {
        outcome: order.outcome,
        action: order.action,
        price: order.limitPriceCents,
        quantity: 0,
      };
    level.quantity += order.remainingQuantity;
    levels.set(key, level);
  }

  return [...levels.values()].sort((a, b) => {
    if (a.outcome !== b.outcome) {
      return a.outcome.localeCompare(b.outcome);
    }
    if (a.action !== b.action) {
      return a.action.localeCompare(b.action);
    }
    return a.action === "BUY" ? b.price - a.price : a.price - b.price;
  });
}

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
      where: {
        marketId,
        status: { in: ["OPEN", "PARTIALLY_FILLED"] },
      },
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
  const book = summarizeBook(openOrders);

  return (
    <main>
      <header className="page-header">
        <div>
          <Link href="/">FriendlyFire</Link>
          <h1>{market.question}</h1>
        </div>
        <nav>
          <span className="signed-in">Signed in as {currentUser.name}</span>
          {currentUser.role === "ADMIN" ? <Link href="/admin">Admin</Link> : null}
          <form action={logoutAction}>
            <button type="submit">Logout</button>
          </form>
        </nav>
      </header>

      <section className="market-summary">
        <h2>Market</h2>
        <dl>
          <div>
            <dt>Status</dt>
            <dd>{market.status}</dd>
          </div>
          <div>
            <dt>Creator</dt>
            <dd>{market.creator.name}</dd>
          </div>
          <div>
            <dt>Close</dt>
            <dd>{market.closeTime.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Collateral</dt>
            <dd>{money(market.collateralCents)}</dd>
          </div>
          <div>
            <dt>Resolution</dt>
            <dd>{market.resolution ?? "-"}</dd>
          </div>
          <div>
            <dt>Resolved By</dt>
            <dd>{userLabel(market.resolvedBy)}</dd>
          </div>
        </dl>
        <h3>Resolution Criteria</h3>
        <p>{market.resolutionCriteria}</p>
        {market.resolutionNote ? (
          <>
            <h3>Resolution Note</h3>
            <p>{market.resolutionNote}</p>
          </>
        ) : null}
      </section>

      <section>
        <h2>Order Book</h2>
        <table>
          <thead>
            <tr>
              <th>Outcome</th>
              <th>Side</th>
              <th>Price</th>
              <th>Quantity</th>
            </tr>
          </thead>
          <tbody>
            {book.map((level) => (
              <tr key={`${level.outcome}-${level.action}-${level.price}`}>
                <td>{level.outcome}</td>
                <td>{level.action}</td>
                <td>{level.price}</td>
                <td>{level.quantity}</td>
              </tr>
            ))}
            {book.length === 0 ? (
              <tr>
                <td colSpan={4}>No open orders.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Place Order</h2>
        <form action={placeOrderAction} className="form-grid compact-form">
          <input type="hidden" name="marketId" value={market.id} />
          <label>
            Outcome
            <select name="outcome" defaultValue="YES" required>
              <option value="YES">YES</option>
              <option value="NO">NO</option>
            </select>
          </label>
          <label>
            Side
            <select name="action" defaultValue="BUY" required>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </label>
          <label>
            Limit Price
            <input name="limitPriceCents" type="number" min={1} max={99} defaultValue={50} required />
          </label>
          <label>
            Quantity
            <input name="quantity" type="number" min={1} step={1} defaultValue={1} required />
          </label>
          <button type="submit">Place</button>
        </form>
      </section>

      <section>
        <h2>Open Orders</h2>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Outcome</th>
              <th>Side</th>
              <th>Price</th>
              <th>Original</th>
              <th>Remaining</th>
              <th>Locked</th>
              <th>Status</th>
              <th>Cancel</th>
            </tr>
          </thead>
          <tbody>
            {openOrders.map((order) => (
              <tr key={order.id}>
                <td>{order.user.name}</td>
                <td>{order.outcome}</td>
                <td>{order.action}</td>
                <td>{order.limitPriceCents}</td>
                <td>{order.originalQuantity}</td>
                <td>{order.remainingQuantity}</td>
                <td>
                  {order.lockedCents > 0
                    ? money(order.lockedCents)
                    : `${order.lockedQuantity} shares`}
                </td>
                <td>{order.status}</td>
                <td>
                  {order.userId === currentUser.id ? (
                    <form action={cancelOrderAction}>
                      <input type="hidden" name="marketId" value={market.id} />
                      <input type="hidden" name="orderId" value={order.id} />
                      <button type="submit">Cancel</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
            {openOrders.length === 0 ? (
              <tr>
                <td colSpan={9}>No open orders.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Recent Trades</h2>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Kind</th>
              <th>Outcome</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Participants</th>
            </tr>
          </thead>
          <tbody>
            {recentTrades.map((trade) => (
              <tr key={trade.id}>
                <td>{trade.createdAt.toLocaleString()}</td>
                <td>{trade.kind}</td>
                <td>{trade.outcome ?? "YES/NO"}</td>
                <td>{trade.quantity}</td>
                <td>
                  {trade.kind === "PRIMARY"
                    ? `YES ${trade.yesPriceCents} / NO ${trade.noPriceCents}`
                    : trade.priceCents}
                </td>
                <td>
                  {trade.kind === "PRIMARY"
                    ? `${userLabel(trade.yesBuyer)} YES, ${userLabel(trade.noBuyer)} NO`
                    : `${userLabel(trade.buyer)} bought from ${userLabel(trade.seller)}`}
                </td>
              </tr>
            ))}
            {recentTrades.length === 0 ? (
              <tr>
                <td colSpan={6}>No trades.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Positions</h2>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Outcome</th>
              <th>Available</th>
              <th>Locked</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => (
              <tr key={position.id}>
                <td>{position.user.name}</td>
                <td>{position.outcome}</td>
                <td>{position.availableQuantity}</td>
                <td>{position.lockedQuantity}</td>
              </tr>
            ))}
            {positions.length === 0 ? (
              <tr>
                <td colSpan={4}>No positions.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="two-column">
        <div>
          <h2>Blacklist</h2>
          <form action={blacklistUserAction} className="form-grid single-column">
            <input type="hidden" name="marketId" value={market.id} />
            <label>
              User
              <select name="userId" required>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Note
              <input name="note" placeholder="Conflict or eligibility note" />
            </label>
            <button type="submit">Blacklist</button>
          </form>
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>By</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {market.blacklist.map((entry) => (
                <tr key={`${entry.marketId}-${entry.userId}`}>
                  <td>{entry.user.name}</td>
                  <td>{entry.createdBy.name}</td>
                  <td>{entry.note ?? ""}</td>
                </tr>
              ))}
              {market.blacklist.length === 0 ? (
                <tr>
                  <td colSpan={3}>No blacklisted users.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div>
          <h2>Resolution</h2>
          <form action={resolveMarketAction} className="form-grid single-column">
            <input type="hidden" name="marketId" value={market.id} />
            <label>
              Result
              <select name="resolution" defaultValue="YES" required>
                <option value="YES">YES</option>
                <option value="NO">NO</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </label>
            <label>
              Note
              <textarea name="note" rows={3} />
            </label>
            <button type="submit">Resolve</button>
          </form>
          {market.status === "RESOLVED" && currentUser.role === "ADMIN" ? (
            <>
              <h3>Admin correction</h3>
              <form action={correctMarketResolutionAction} className="form-grid single-column">
                <input type="hidden" name="marketId" value={market.id} />
                <label>
                  Corrected result
                  <select name="resolution" defaultValue={market.resolution ?? "YES"} required>
                    <option value="YES">YES</option>
                    <option value="NO">NO</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </label>
                <label>
                  Correction note
                  <textarea name="note" rows={3} />
                </label>
                <button type="submit">Correct resolution</button>
              </form>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
