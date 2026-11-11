// Live part prices from eBay's Browse API. Needs a free eBay developer keyset, which an admin pastes in
// on the Admin page, or which can be set as EBAY_CLIENT_ID and EBAY_CLIENT_SECRET. Without one it's off.
import { HttpError } from "./api";
import { getSetting, keyHint } from "./settings";

const API = "https://api.ebay.com";
/** eBay Motors: Parts & Accessories. Keeps phone cases and toys out of the results. */
const PARTS_CATEGORY = "6028";

export type PriceResult = {
  title: string;
  priceCents: number;
  currency: string;
  condition: string | null;
  url: string;
  /** True when eBay matched the listing against the vehicle's year, make and model. */
  fits: boolean;
};

export type PriceLookup = {
  enabled: boolean;
  query: string;
  results: PriceResult[];
  /** Middle price of the results, in cents. */
  medianCents: number | null;
  lowCents: number | null;
  highCents: number | null;
};

/** The container's environment wins, so a key set there can't be changed from the app. */
function credentials(): { id: string; secret: string; source: "env" | "app" } | null {
  if (process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET) return { id: process.env.EBAY_CLIENT_ID, secret: process.env.EBAY_CLIENT_SECRET, source: "env" };
  const id = getSetting("ebay_client_id"), secret = getSetting("ebay_client_secret");
  return id && secret ? { id, secret, source: "app" } : null;
}

export const ebayEnabled = () => credentials() !== null;

export function ebayStatus() {
  const c = credentials();
  return { configured: !!c, source: c?.source ?? null, hint: keyHint(c?.id) };
}

let token: { value: string; expiresAt: number; id: string } | null = null;

/** Forget the token and cached prices, after the keys change. */
export function resetEbay() {
  token = null;
  cache.clear();
}

async function appToken(): Promise<string> {
  const c = credentials();
  if (!c) throw new HttpError(400, "eBay prices aren't set up.");
  if (token && token.id === c.id && Date.now() < token.expiresAt) return token.value;
  const auth = Buffer.from(`${c.id}:${c.secret}`).toString("base64");
  const res = await fetch(`${API}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=" + encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    console.warn(`[ebay] token request failed: ${res.status}`);
    throw new HttpError(502, res.status === 400 || res.status === 401
      ? "eBay didn't accept those keys. Check you copied the Production App ID and Cert ID, not the Sandbox ones."
      : "eBay prices aren't available right now.");
  }
  const j = await res.json() as { access_token: string; expires_in: number };
  // Renew a minute early so a request never goes out with a token that just expired.
  token = { value: j.access_token, expiresAt: Date.now() + (j.expires_in - 60) * 1000, id: c.id };
  return token.value;
}

const cache = new Map<string, { at: number; data: PriceLookup }>();
const CACHE_MS = 30 * 60 * 1000;

/** eBay's compatibility filter treats these as special characters. */
const clean = (s: string) => s.replace(/[;:,{}|]/g, " ").trim();

type Summary = {
  title?: string; price?: { value?: string; currency?: string }; condition?: string; itemWebUrl?: string;
  compatibilityMatch?: string;
};

async function search(q: string, fitment: string | null): Promise<PriceResult[]> {
  const params = new URLSearchParams({ q, category_ids: PARTS_CATEGORY, limit: "20", filter: "buyingOptions:{FIXED_PRICE},priceCurrency:USD" });
  if (fitment) params.set("compatibility_filter", fitment);
  const res = await fetch(`${API}/buy/browse/v1/item_summary/search?${params}`, {
    headers: { Authorization: `Bearer ${await appToken()}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401) token = null;
  if (!res.ok) {
    console.warn(`[ebay] search failed: ${res.status}`);
    throw new HttpError(502, "eBay prices aren't available right now.");
  }
  const j = await res.json() as { itemSummaries?: Summary[] };
  return (j.itemSummaries ?? []).flatMap(s => {
    const value = Number(s.price?.value);
    // Only ever link to eBay itself.
    const url = s.itemWebUrl && /^https:\/\/(www\.)?ebay\.com\//.test(s.itemWebUrl) ? s.itemWebUrl : null;
    if (!s.title || !Number.isFinite(value) || value <= 0 || !url) return [];
    return [{
      title: s.title.slice(0, 200), priceCents: Math.round(value * 100), currency: s.price?.currency ?? "USD",
      condition: s.condition ?? null, url, fits: !!fitment && (s.compatibilityMatch === "EXACT" || s.compatibilityMatch === "POSSIBLE"),
    }];
  });
}

/**
 * Current fixed-price listings for a part, preferring ones eBay says fit the vehicle.
 * Falls back to a plain search when nothing is tagged for the vehicle.
 */
export async function lookupPrices(q: string, vehicle: { year: number | null; make: string | null; model: string | null }, fresh = false): Promise<PriceLookup> {
  const query = clean(q).slice(0, 120);
  const empty: PriceLookup = { enabled: ebayEnabled(), query, results: [], medianCents: null, lowCents: null, highCents: null };
  if (!empty.enabled || query.length < 2) return empty;

  const fitment = vehicle.year && vehicle.make && vehicle.model
    ? `Year:${vehicle.year};Make:${clean(vehicle.make)};Model:${clean(vehicle.model)}`
    : null;
  const key = `${query.toLowerCase()}|${fitment ?? ""}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  let results = fitment ? await search(query, fitment) : [];
  if (results.length === 0) results = await search(query, null);
  // Cheapest first.
  results.sort((a, b) => a.priceCents - b.priceCents);
  const prices = results.map(r => r.priceCents);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;
  const data: PriceLookup = {
    ...empty, results: results.slice(0, 8),
    medianCents: median, lowCents: prices[0] ?? null, highCents: prices[prices.length - 1] ?? null,
  };
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), data });
  return data;
}
