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

export type EbayItem = { title: string; brand: string | null; partNumber: string | null; priceCents: number | null; url: string };

type ItemJson = {
  title?: string; brand?: string; mpn?: string; itemWebUrl?: string;
  price?: { value?: string; currency?: string };
  localizedAspects?: { name?: string; value?: string }[];
};

/** Turns eBay's item JSON into part details. Exported for tests. */
export function ebayItemFrom(j: ItemJson, fallbackUrl: string): EbayItem | null {
  if (!j.title) return null;
  const aspect = (re: RegExp) => j.localizedAspects?.find(a => a.name && re.test(a.name))?.value?.trim() || null;
  const value = Number(j.price?.value);
  const url = j.itemWebUrl && /^https:\/\/(www\.)?ebay\.com\//.test(j.itemWebUrl) ? j.itemWebUrl.split("?")[0] : fallbackUrl;
  const pn = (j.mpn && !/^(n\/?a|does not apply|unbranded)$/i.test(j.mpn) ? j.mpn : null) ?? aspect(/^manufacturer part number$/i);
  const brand = (j.brand && !/^(unbranded|n\/?a|does not apply)$/i.test(j.brand) ? j.brand : null) ?? aspect(/^brand$/i);
  return {
    title: j.title.slice(0, 300),
    brand: brand && !/^(unbranded|n\/?a|does not apply)$/i.test(brand) ? brand.slice(0, 80) : null,
    partNumber: pn && !/^(n\/?a|does not apply)$/i.test(pn) ? pn.slice(0, 60) : null,
    priceCents: Number.isFinite(value) && value > 0 && (j.price?.currency ?? "USD") === "USD" ? Math.round(value * 100) : null,
    url,
  };
}

/**
 * One eBay listing, by the number in its link, through eBay's API. eBay doesn't let apps read its pages,
 * so this needs the same free keys as live prices. A listing with options (sizes, sides) returns its first option.
 */
export async function ebayItem(itemId: string, variationId: string | null, fallbackUrl: string): Promise<EbayItem | null> {
  if (!ebayEnabled()) return null;
  const headers = async () => ({ Authorization: `Bearer ${await appToken()}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" });
  const params = new URLSearchParams({ legacy_item_id: itemId });
  if (variationId) params.set("legacy_variation_id", variationId);
  let res = await fetch(`${API}/buy/browse/v1/item/get_item_by_legacy_id?${params}`, { headers: await headers(), signal: AbortSignal.timeout(8000) });
  if (res.status === 401) token = null;
  if (res.ok) return ebayItemFrom(await res.json() as ItemJson, fallbackUrl);
  // 11006: the listing has options, so eBay wants one of them. Read them as a group and take the first.
  const err = await res.json().catch(() => ({})) as { errors?: { errorId?: number }[] };
  if (res.status === 400 && err.errors?.some(e => e.errorId === 11006)) {
    res = await fetch(`${API}/buy/browse/v1/item/get_items_by_item_group?item_group_id=${encodeURIComponent(itemId)}`, { headers: await headers(), signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const g = await res.json() as { items?: ItemJson[] };
      return g.items?.[0] ? ebayItemFrom(g.items[0], fallbackUrl) : null;
    }
  }
  console.warn(`[ebay] item ${itemId} lookup failed: ${res.status}`);
  if (res.status === 404) throw new HttpError(404, "eBay says that listing doesn't exist. It may have ended and been removed.");
  return null;
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
