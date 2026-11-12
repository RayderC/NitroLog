// Fills in a part from a store link you paste. AutoZone and O'Reilly links spell out the product, so those are
// read from the link alone (both stores refuse apps). For Amazon, NitroLog asks for that one page, saying who
// it is, and Amazon serves it the product page: title, brand, part number and price. It never poses as a
// browser: if Amazon says no, it falls back to the words in the link, and the price is typed.
import { HttpError, bad } from "./api";
import { BRANDS, parseProductTitle, priceToCents } from "./partText";

export type LinkedPart = {
  store: "Amazon" | "AutoZone" | "O'Reilly";
  kind: "part" | "fluid";
  name: string;
  brand: string | null;
  partNumber: string | null;
  /** The price on the page Amazon served, in cents. Null for AutoZone and O'Reilly, which don't serve pages. */
  priceCents: number | null;
  quantity: number | null;
  unit: string | null;
  /** True when the product's name was found. False for a bare Amazon link Amazon wouldn't describe. */
  named: boolean;
  /** Where the details came from: the title Amazon served, or only the words in the link. */
  from: "title" | "link";
  url: string;
};

const STORES: { store: LinkedPart["store"]; hosts: RegExp }[] = [
  { store: "Amazon", hosts: /^(www\.|smile\.)?amazon\.com$|^(a\.co|amzn\.to|amzn\.com)$/ },
  { store: "AutoZone", hosts: /^(www\.)?autozone\.com$/ },
  { store: "O'Reilly", hosts: /^(www\.)?oreillyauto\.com$/ },
];
const SHORT = /^(a\.co|amzn\.to|amzn\.com)$/;


const title = (words: string[]) => words.map(w => (/\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");

/** Pulls a known brand off the front of a slug's words. Tries longer names first, for "mobil-1" and the like. */
function takeBrand(words: string[]): { brand: string | null; rest: string[] } {
  for (const n of [3, 2, 1]) {
    const key = words.slice(0, n).join("-");
    if (BRANDS[key]) return { brand: BRANDS[key], rest: words.slice(n) };
  }
  return { brand: null, rest: words };
}

/** The part number at the end of a product slug: "hp-1017", "s5xl", "51307". */
function takePartNumber(words: string[]): { partNumber: string | null; rest: string[] } {
  if (!words.length) return { partNumber: null, rest: words };
  const last = words[words.length - 1];
  if (!/\d/.test(last)) return { partNumber: null, rest: words };
  const prev = words[words.length - 2];
  // "hp-1017" is split into "hp" and "1017" in a slug, so put a short letters-only prefix back on.
  if (prev && /^[a-z]{1,3}$/.test(prev) && /^\d/.test(last)) return { partNumber: `${prev}-${last}`.toUpperCase(), rest: words.slice(0, -2) };
  return { partNumber: last.toUpperCase(), rest: words.slice(0, -1) };
}

type Parsed = Omit<LinkedPart, "url" | "store" | "kind" | "quantity" | "unit" | "from">;

function fromAutoZone(u: URL): Parsed {
  // /p/stp-extended-life-engine-oil-filter-s5xl/663654, sometimes after a category path.
  const segs = u.pathname.split("/").filter(Boolean);
  const slug = segs[segs.indexOf("p") + 1];
  if (!segs.includes("p") || !slug) throw bad("That AutoZone link isn't a product page. Open the part, then copy its link.");
  const { brand, rest } = takeBrand(slug.toLowerCase().split("-"));
  const { partNumber, rest: name } = takePartNumber(rest);
  return { name: title(name).slice(0, 160) || "AutoZone part", brand, partNumber, priceCents: null, named: name.length > 0 };
}

function fromOReilly(u: URL): Parsed {
  // /detail/c/wix/filters/differential-oil-filter/1519dc05a6f2/wix-oil-filter/wix0/51307
  const segs = u.pathname.split("/").filter(Boolean);
  if (segs[0] !== "detail" || segs.length < 5) throw bad("That O'Reilly link isn't a product page. Open the part, then copy its link.");
  const partNumber = decodeURIComponent(segs[segs.length - 1]).toUpperCase();
  const brandSlug = segs[2]?.toLowerCase() ?? "";
  const brand = BRANDS[brandSlug] ?? (brandSlug ? title(brandSlug.split("-")) : null);
  // The product's own name sits just before the line code and part number.
  let words = (segs[segs.length - 3] ?? "").toLowerCase().split("-").filter(Boolean);
  if (words.slice(0, brandSlug.split("-").length).join("-") === brandSlug) words = words.slice(brandSlug.split("-").length);
  return { name: title(words).slice(0, 160) || "O'Reilly part", brand, partNumber, priceCents: null, named: words.length > 0 };
}

function fromAmazon(u: URL): Parsed {
  // /K-N-Premium-Wrench-Off-HP-1017/dp/B000NKCIKM: the words before /dp/ are the product's title.
  const segs = u.pathname.split("/").filter(Boolean);
  const dp = segs.findIndex(s => s === "dp" || s === "gp");
  if (dp < 0) throw bad("That Amazon link isn't a product page. Open the item, then copy its link.");
  const words = dp > 0 ? decodeURIComponent(segs[dp - 1]).toLowerCase().split("-").filter(Boolean) : [];
  // Amazon's link words are a cut-down title and often end in filler, like
  // "Select-Oil-Filter-Description-Compatible" from "…Compatible with Select … (See Description)".
  const kept = words.filter(w => !AMAZON_FILLER.has(w));
  // A brand can sit anywhere, not only first.
  let brand: string | null = null, rest = kept;
  for (let i = 0; i < kept.length && !brand; i++) {
    const t = takeBrand(kept.slice(i));
    if (t.brand) { brand = t.brand; rest = [...kept.slice(0, i), ...t.rest]; }
  }
  // A part number is a word with both letters and digits, like "hp-1017" or "ph7317", anywhere in the words.
  let partNumber: string | null = null;
  const end = takePartNumber(rest);
  if (end.partNumber && /[a-z]/i.test(end.partNumber) && /\d/.test(end.partNumber)) { partNumber = end.partNumber; rest = end.rest; }
  else {
    const i = rest.findIndex(w => /[a-z]/.test(w) && /\d/.test(w) && w.length >= 4);
    if (i >= 0) { partNumber = rest[i].toUpperCase(); rest = rest.filter((_, j) => j !== i); }
  }
  // Without real words left, the name has to be typed.
  const name = rest.filter(w => !/^\d+$/.test(w) || rest.length <= 3);
  return { name: title(name).slice(0, 160) || "Amazon item", brand, partNumber, priceCents: null, named: name.length > 0 };
}

/** Words Amazon's link titles are padded with that never name the part. */
const AMAZON_FILLER = new Set([
  "select", "description", "compatible", "compatibility", "with", "for", "see", "models", "model", "vehicles", "vehicle",
  "fits", "fit", "replacement", "replaces", "replace", "oem", "pack", "count", "pcs", "pc", "the", "and", "of", "in", "to",
  "a", "an",
]);

function storeOf(u: URL) {
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  return STORES.find(s => s.hosts.test(u.hostname.toLowerCase()))?.store ?? null;
}

/**
 * Turns an Amazon short link (a.co/d/…, amzn.to/…) into the full one by reading where it redirects.
 * Only the redirect is read, never a page, and every hop has to stay on Amazon.
 */
async function expandShortLink(start: URL): Promise<URL> {
  let url = start;
  for (let hop = 0; hop < 4 && SHORT.test(url.hostname.toLowerCase()); hop++) {
    let res: Response;
    try {
      // A GET, because a.co answers HEAD with 404. Only the redirect header is used; the body is dropped unread.
      res = await fetch(url, { redirect: "manual", headers: { "User-Agent": "NitroLog link reader" }, signal: AbortSignal.timeout(8000) });
      res.body?.cancel().catch(() => {});
    } catch {
      throw new HttpError(502, "Couldn't open that short link. Open it on your phone and copy the full product link instead.");
    }
    const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!next) throw new HttpError(502, "Amazon didn't say where that short link goes. Open it and copy the full product link instead.");
    const n = new URL(next, url);
    if (storeOf(n) !== "Amazon") throw bad("That link goes somewhere other than Amazon.");
    url = n;
  }
  return url;
}

/** Says who's asking. Amazon serves this the product page. */
const AGENT = "NitroLog/1.0 (personal vehicle maintenance log; reads one product page a person pasted)";

/** What Amazon's product page says about the item. */
export type AmazonPage = { title: string; priceCents: number | null; brand: string | null; partNumber: string | null; count: number | null };

/** The first thing matched by `re` inside the `span` characters after `marker`, or null. */
function near(html: string, marker: string, re: RegExp, span = 8000): string | null {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  return html.slice(at, at + span).match(re)?.[1] ?? null;
}

/**
 * Reads the product page Amazon serves NitroLog: title, price, brand, part number and pack size.
 * Amazon's pages are about 2 MB, so the whole page is read, up to a cap. Only Amazon addresses are followed.
 */
export function readAmazonPage(html: string): AmazonPage | null {
  const title = html.match(/<meta name="title" content="([^"]{4,600})"/)?.[1] ?? html.match(/id="productTitle"[^>]*>\s*([^<]{4,600})</)?.[1];
  if (!title) return null;
  // The price shown by the buy box. Each is the "a-offscreen" copy Amazon writes out for screen readers.
  const price = near(html, 'id="corePrice_feature_div"', /class="a-offscreen">([^<]{1,30})</)
    ?? near(html, 'id="corePriceDisplay_desktop_feature_div"', /class="a-offscreen">([^<]{1,30})</)
    ?? near(html, 'id="corePrice_desktop"', /class="a-offscreen">([^<]{1,30})</)
    ?? near(html, 'id="apex_desktop"', /class="a-offscreen">([^<]{1,30})</);
  const brand = html.match(/>Brand<\/span>\s*<\/td>\s*<td[^>]*>\s*<span[^>]*>([^<]{1,80})</)?.[1]
    ?? html.match(/<a id="bylineInfo"[^>]*>([^<]{1,100})</)?.[1]?.replace(/^Visit the\s+/i, "").replace(/\s+Store$/i, "").replace(/^Brand:\s*/i, "");
  const partNumber = html.match(/Manufacturer\s*Part\s*Number\s*<\/th>\s*<td[^>]*>\s*([^<]{1,60}?)\s*</i)?.[1]
    ?? html.match(/Item model number\s*<\/th>\s*<td[^>]*>\s*([^<]{1,60}?)\s*</i)?.[1];
  const count = html.match(/Unit Count\s*<\/th>\s*<td[^>]*>\s*(\d{1,4})\s*Count/i)?.[1];
  return {
    title: decode(title),
    priceCents: price ? priceToCents(decode(price)) : null,
    brand: brand ? decode(brand).slice(0, 80) : null,
    partNumber: partNumber ? decode(partNumber).slice(0, 60) : null,
    count: count ? Number(count) : null,
  };
}

/** Fetches one Amazon product page as NitroLog and reads it. Null when Amazon won't serve it. */
async function amazonPage(start: URL): Promise<AmazonPage | null> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    let res: Response;
    try {
      res = await fetch(url, { redirect: "manual", headers: { "User-Agent": AGENT, Accept: "text/html" }, signal: AbortSignal.timeout(15_000) });
    } catch { return null; }
    if (res.status >= 300 && res.status < 400) {
      res.body?.cancel().catch(() => {});
      const next = res.headers.get("location");
      if (!next) return null;
      const n = new URL(next, url);
      if (storeOf(n) !== "Amazon") return null;
      url = n;
      continue;
    }
    if (!res.ok || !res.body) { res.body?.cancel().catch(() => {}); return null; }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < 4_000_000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); size += value.length;
    }
    reader.cancel().catch(() => {});
    return readAmazonPage(Buffer.concat(chunks).toString("utf8"));
  }
  return null;
}

const decode = (s: string) => s
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, " ").trim();

export async function partFromLink(raw: unknown): Promise<LinkedPart> {
  if (typeof raw !== "string" || raw.length > 2000) throw bad("Paste a link from Amazon, AutoZone or O'Reilly.");
  // Phones often share "Product name https://…", so find the link inside whatever was pasted.
  const found = raw.match(/https?:\/\/\S+/)?.[0] ?? raw.trim();
  let u: URL;
  try { u = new URL(found); } catch { throw bad("That isn't a link. Copy the product's link from Amazon, AutoZone or O'Reilly."); }
  const store = storeOf(u);
  if (!store) throw bad("Only Amazon, AutoZone and O'Reilly links work for now.");
  if (store === "Amazon" && SHORT.test(u.hostname.toLowerCase())) u = await expandShortLink(u);
  const clean = `${u.origin}${u.pathname}`;
  if (store === "Amazon") {
    const page = await amazonPage(new URL(clean));
    if (page) {
      const t = parseProductTitle(page.title, page.brand);
      // A "Pack of 12" is 12 parts at the pack's price. A fluid's size comes from its title.
      const quantity = t.kind === "part" && page.count && page.count > 1 ? page.count : t.quantity;
      return { store, ...t, partNumber: page.partNumber ?? t.partNumber, quantity, priceCents: page.priceCents, named: true, from: "title", url: clean };
    }
  }
  const part = store === "AutoZone" ? fromAutoZone(u) : store === "O'Reilly" ? fromOReilly(u) : fromAmazon(u);
  // Drop tracking and session bits before handing the link back.
  return { store, kind: "part", quantity: null, unit: null, ...part, from: "link", url: clean };
}
