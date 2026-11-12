// Reads a product's details from a store page, using what stores publish for search engines: schema.org
// Product data (as JSON-LD or microdata) and Open Graph tags, then the page's own title. No site-specific code.
import { priceToCents } from "./partText";

export type PageProduct = {
  title: string;
  brand: string | null;
  partNumber: string | null;
  priceCents: number | null;
  currency: string | null;
  site: string | null;
};

export const decodeHtml = (s: string) => s
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/gi, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const str = (v: unknown, max = 300): string | null => {
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return null;
  const t = decodeHtml(v).slice(0, max);
  return t || null;
};

type Found = Partial<Omit<PageProduct, "site">>;

/** A price that is really there: "0" and "0.00" are placeholders some stores use. */
function cents(v: unknown): number | null {
  const s = str(v, 40);
  if (!s) return null;
  // Machine-readable prices use a dot for decimals, so commas are only thousands separators here.
  const c = priceToCents(s.replace(/,/g, ""));
  return c && c > 0 ? c : null;
}

// ── JSON-LD ──

function isProduct(o: any) {
  const t = o?.["@type"];
  return [].concat(t ?? []).some((x: unknown) => typeof x === "string" && /^(Product|ProductGroup|IndividualProduct|ProductModel|Vehicle|Car)$/.test(x.replace(/^.*[/#]/, "")));
}

function offerPrice(offers: any): { cents: number | null; currency: string | null } {
  for (const o of [].concat(offers ?? []) as any[]) {
    if (!o || typeof o !== "object") continue;
    const spec = ([] as any[]).concat(o.priceSpecification ?? [])[0];
    const c = cents(o.price ?? o.lowPrice ?? spec?.price);
    if (c) return { cents: c, currency: str(o.priceCurrency ?? spec?.priceCurrency, 5) };
    const nested = offerPrice(o.offers);
    if (nested.cents) return nested;
  }
  return { cents: null, currency: null };
}

function fromJsonLd(html: string): Found {
  const out: Found = {};
  const seen: any[] = [];
  const walk = (o: any, depth = 0) => {
    if (!o || typeof o !== "object" || depth > 6) return;
    if (Array.isArray(o)) { o.forEach(x => walk(x, depth + 1)); return; }
    if (isProduct(o)) seen.push(o);
    walk(o["@graph"], depth + 1);
    walk(o.mainEntity, depth + 1);
    walk(o.itemListElement, depth + 1);
  };
  for (const m of html.matchAll(/<script[^>]+type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* a broken block is skipped */ }
  }
  const p = seen[0];
  if (!p) return out;
  const variant = [].concat(p.hasVariant ?? [])[0] as any;
  out.title = str(p.name, 600) ?? str(variant?.name, 600) ?? undefined;
  const b = p.brand ?? p.manufacturer;
  out.brand = str(typeof b === "object" ? [].concat(b)[0]?.["name"] : b, 80) ?? undefined;
  out.partNumber = str(p.mpn ?? variant?.mpn ?? p.sku ?? variant?.sku, 60) ?? undefined;
  let price = offerPrice(p.offers);
  if (!price.cents && variant) price = offerPrice(variant.offers);
  if (price.cents) { out.priceCents = price.cents; out.currency = price.currency ?? undefined; }
  return out;
}

// ── Microdata (itemprop="…") ──

function attrs(tag: string): Record<string, string> {
  const a: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) a[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return a;
}

function fromMicrodata(html: string): Found {
  const start = html.search(/itemtype=["']?https?:\/\/schema\.org\/Product["'\s>]/i);
  if (start < 0) return {};
  const body = html.slice(start, start + 600_000);
  const out: Found = {};
  // The first value of each property after the product starts. Brand and manufacturer can be nested items with their own name.
  let pendingBrand = false;
  for (const m of body.matchAll(/<([a-z0-9]+)\b([^>]*\bitemprop\s*=\s*["']?([a-zA-Z]+)[^>]*)>([^<]{0,400})/gi)) {
    const prop = m[3].toLowerCase();
    const a = attrs(m[2]);
    const value = a.content ?? (m[1].toLowerCase() === "link" ? a.href : m[4]);
    if (prop === "brand" || prop === "manufacturer") {
      if (out.brand) continue;
      if ("itemscope" in a || /\bitemscope\b/i.test(m[2])) { pendingBrand = true; continue; }
      out.brand = str(value, 80) ?? undefined;
      continue;
    }
    if (prop === "name") {
      if (pendingBrand && !out.brand) { out.brand = str(value, 80) ?? undefined; pendingBrand = false; continue; }
      if (!out.title) out.title = str(value, 600) ?? undefined;
      continue;
    }
    if ((prop === "mpn" || prop === "sku" || prop === "productid") && !out.partNumber) out.partNumber = str(value, 60) ?? undefined;
    if ((prop === "price" || prop === "lowprice") && !out.priceCents) {
      const c = cents(value);
      if (c) out.priceCents = c;
    }
    if (prop === "pricecurrency" && !out.currency) out.currency = str(value, 5) ?? undefined;
  }
  return out;
}

// ── Open Graph and plain HTML ──

function meta(html: string, name: string): string | null {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if ((a.property ?? a.name ?? "").toLowerCase() === name) return str(a.content, 600);
  }
  return null;
}

/** Pages that bot checks and firewalls serve instead of the product. */
const CHALLENGE = /^(pardon our interruption|just a moment|attention required|access denied|robot check|are you a robot|security check|one more step|please wait|request blocked|forbidden|captcha)/i;

export function isChallengePage(html: string): boolean {
  const t = str(html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1], 300) ?? "";
  return CHALLENGE.test(t) || /captcha-delivery\.com|cf-challenge|challenge-platform|px-captcha|_Incapsula_Resource/i.test(html.slice(0, 20_000));
}

/**
 * Product details from a store page, or null when the page isn't about one product, such as a home page,
 * a search page or a bot check. A page counts when it carries product data or says it's a product page.
 */
export function readProductPage(html: string): PageProduct | null {
  if (isChallengePage(html)) return null;
  const ld = fromJsonLd(html);
  const md = fromMicrodata(html);
  const site = meta(html, "og:site_name");
  const ogPrice = cents(meta(html, "product:price:amount") ?? meta(html, "og:price:amount"));
  const productPage = !!(ld.title || md.title || ld.priceCents || md.priceCents || ogPrice || /product/i.test(meta(html, "og:type") ?? ""));
  if (!productPage) return null;
  const h1 = html.match(/<h1\b[^>]*>([\s\S]{1,600}?)<\/h1>/i)?.[1];
  const docTitle = html.match(/<title[^>]*>([^<]{1,600})<\/title>/i)?.[1];
  let title = ld.title ?? md.title ?? meta(html, "og:title") ?? str(h1, 600) ?? str(docTitle, 600);
  if (!title) return null;
  // "Cam Kit | MMX" or "Cam Kit - Summit Racing": drop the shop's name off the end.
  if (site) title = title.replace(new RegExp(`\\s*[|–—:-]\\s*${site.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "") || title;
  return {
    title,
    brand: ld.brand ?? md.brand ?? meta(html, "product:brand") ?? null,
    partNumber: ld.partNumber ?? md.partNumber ?? meta(html, "product:retailer_item_id") ?? null,
    priceCents: ld.priceCents ?? md.priceCents ?? ogPrice ?? null,
    currency: ld.currency ?? md.currency ?? meta(html, "product:price:currency") ?? meta(html, "og:price:currency") ?? null,
    site,
  };
}
