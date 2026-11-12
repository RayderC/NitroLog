// Price-drop alerts for parts with a saved store link. Each person turns them on in Settings and picks which
// parts to watch. Once a day, each watched page is read the same way a pasted link is (as NitroLog, never
// posing as a browser, and without Gemini so the free allowance is left for people). An alert goes out only
// for a real drop: at least 5% and $1 below both the starting price and the last price already alerted.
import { db } from "./db";
import { bad, int, notFound, requiredText, webLink } from "./api";
import { partFromLink } from "./productLink";
import type { PriceWatch } from "./types";

const DAY = 24 * 60 * 60 * 1000;

type Row = {
  id: number; url: string; name: string; enabled: number; start_cents: number | null; last_cents: number | null; low_cents: number | null;
  alerted_cents: number | null; checked_at: string | null; last_error: string | null;
};

const toWatch = (r: Row): PriceWatch => ({
  id: r.id, url: r.url, name: r.name, enabled: !!r.enabled, startCents: r.start_cents, lastCents: r.last_cents, lowCents: r.low_cents,
  checkedAt: r.checked_at, problem: r.last_error,
});

export function listWatches(userId: number): PriceWatch[] {
  return (db.prepare("SELECT * FROM price_watches WHERE user_id = ? ORDER BY name COLLATE NOCASE").all(userId) as Row[]).map(toWatch);
}

/** Starts watching a link. The price you paid, when known, is where drops are measured from. */
export function addWatch(userId: number, b: any): PriceWatch {
  const url = webLink(b?.url, "Link");
  if (!url) throw bad("A part needs a store link to watch its price.");
  const name = requiredText(b?.name, "Name", 160);
  const paid = Number.isInteger(b?.priceCents) && b.priceCents > 0 && b.priceCents < 10_000_000 ? b.priceCents : null;
  if ((db.prepare("SELECT COUNT(*) c FROM price_watches WHERE user_id = ?").get(userId) as { c: number }).c >= 200) throw bad("You're watching 200 parts already. Remove some first.");
  db.prepare(`INSERT INTO price_watches (user_id, url, name, start_cents, last_cents, low_cents) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, url) DO UPDATE SET enabled = 1, name = excluded.name`).run(userId, url, name, paid, paid, paid);
  return toWatch(db.prepare("SELECT * FROM price_watches WHERE user_id = ? AND url = ?").get(userId, url) as Row);
}

function owned(userId: number, id: unknown): number {
  const n = int(id);
  if (!db.prepare("SELECT 1 FROM price_watches WHERE id = ? AND user_id = ?").get(n, userId)) throw notFound("Not watching that part");
  return n;
}

export function setWatchEnabled(userId: number, id: unknown, enabled: unknown) {
  db.prepare("UPDATE price_watches SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, owned(userId, id));
}

export function deleteWatch(userId: number, id: unknown) {
  db.prepare("DELETE FROM price_watches WHERE id = ?").run(owned(userId, id));
}

/**
 * Whether a new price is worth an alert. It has to be a real drop: 5% and $1 below where the part started and
 * below the last price you were told about, so small wobbles and the same sale never alert twice. Exported for tests.
 */
export function isAlertWorthy(price: number, start: number | null, alerted: number | null): boolean {
  const base = Math.min(...[start, alerted].filter((x): x is number => x !== null));
  if (!Number.isFinite(base)) return false;
  return price <= base * 0.95 && base - price >= 100;
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

/** One pass for the hourly job: links not checked for a day, for people with alerts on, a few at a time. */
export async function runPriceCheck(send: (userId: number, msg: { title: string; body: string; url: string }) => Promise<number>) {
  const cutoff = new Date(Date.now() - DAY + 30 * 60 * 1000).toISOString();
  const due = db.prepare(`SELECT w.*, w.user_id FROM price_watches w JOIN users u ON u.id = w.user_id
    WHERE u.disabled = 0 AND u.price_alerts = 1 AND w.enabled = 1 AND (w.checked_at IS NULL OR w.checked_at < ?)
    ORDER BY w.checked_at IS NOT NULL, w.checked_at LIMIT 25`).all(cutoff) as (Row & { user_id: number })[];
  const drops = new Map<number, string[]>();
  for (const w of due) {
    let price: number | null = null, problem: string | null = null;
    try {
      price = (await partFromLink(w.url)).priceCents;
      if (price === null) problem = "The store doesn't show a price NitroLog can read.";
    } catch (e) { problem = (e as Error).message.slice(0, 200); }
    const now = new Date().toISOString();
    if (price === null) {
      db.prepare("UPDATE price_watches SET checked_at = ?, last_error = ? WHERE id = ?").run(now, problem, w.id);
    } else {
      const start = w.start_cents ?? price;
      const worthy = isAlertWorthy(price, start, w.alerted_cents);
      db.prepare(`UPDATE price_watches SET checked_at = ?, last_error = NULL, last_cents = ?, start_cents = ?, low_cents = MIN(COALESCE(low_cents, ?), ?),
        alerted_cents = CASE WHEN ? THEN ? ELSE alerted_cents END WHERE id = ?`).run(now, price, start, price, price, worthy ? 1 : 0, price, w.id);
      if (worthy) drops.set(w.user_id, [...(drops.get(w.user_id) ?? []), `${w.name} is ${money(price)} (was ${money(Math.min(start, w.alerted_cents ?? start))})`]);
    }
    // Gentle on the stores: one page every couple of seconds.
    await new Promise(r => setTimeout(r, 2000));
  }
  // One alert per person per pass, however many parts dropped.
  for (const [userId, lines] of drops) {
    await send(userId, {
      title: lines.length === 1 ? "Price drop" : `${lines.length} price drops`,
      body: lines.slice(0, 3).join(". ") + (lines.length > 3 ? `, and ${lines.length - 3} more.` : "."),
      url: "/settings#alerts",
    });
  }
}
