// Fills in a part from a store link you paste. NitroLog asks for that one page under its own name and never
// poses as a browser. Amazon serves it the product page, so the title, price, brand and part number come from
// there. Most other stores publish the same details for search engines, which lib/pageReader.ts reads.
// AutoZone and O'Reilly refuse apps, so those come from the words in the link, and eBay refuses apps too, so
// eBay listings are read through eBay's own API when its keys are set. A store that says no gets a clear
// message suggesting a screenshot instead.
import { HttpError, bad } from "./api";
import { ebayItem } from "./ebay";
import { geminiEnabled, readLinkWithAi } from "./gemini";
import { isChallengePage, readProductPage } from "./pageReader";
import { BRANDS, parseProductTitle, priceToCents } from "./partText";
import { AGENT, checkPublicUrl, getPublicPage } from "./safeFetch";

export type LinkedPart = {
  /** The shop's name, like "Amazon" or "Modern Muscle Xtreme". */
  store: string;
  kind: "part" | "fluid";
  name: string;
  brand: string | null;
  partNumber: string | null;
  /** The price on the page, in cents. Null when the store didn't say, or refuses apps. */
  priceCents: number | null;
  quantity: number | null;
  unit: string | null;
  /** True when the product's name was found. False for a bare Amazon link Amazon wouldn't describe. */
  named: boolean;
  /** Where the details came from: the store's page or API, Gemini reading the page, or only the words in the link. */
  from: "title" | "page" | "link" | "ai";
  url: string;
};

type Known = "Amazon" | "AutoZone" | "O'Reilly" | "eBay";
const STORES: { store: Known; hosts: RegExp }[] = [
  { store: "Amazon", hosts: /^(www\.|smile\.)?amazon\.com$|^(a\.co|amzn\.to|amzn\.com)$/ },
  { store: "AutoZone", hosts: /^(www\.)?autozone\.com$/ },
  { store: "O'Reilly", hosts: /^(www\.)?oreillyauto\.com$/ },
  { store: "eBay", hosts: /^(www\.|m\.)?ebay\.com$|^ebay\.us$/ },
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

/** Product words from a link's last wordy path segment, for a store that won't describe the page. */
function fromSlug(u: URL): Parsed | null {
  const seg = u.pathname.split("/").filter(Boolean).map(x => { try { return decodeURIComponent(x); } catch { return x; } })
    .filter(x => /[a-z]{3,}.*-.*[a-z]{3,}/i.test(x)).pop();
  if (!seg) return null;
  const words = seg.toLowerCase().replace(/\.(html?|aspx?|php)$/, "").split(/[-_+]+/).filter(Boolean);
  const { brand, rest } = takeBrand(words);
  const kept = rest.filter(w => !AMAZON_FILLER.has(w));
  if (!kept.length) return null;
  return { name: title(kept).slice(0, 160), brand, partNumber: null, priceCents: null, named: true };
}

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

/** Tracking bits that don't change which product a link shows. */
const TRACKING = /^(utm_\w+|fbclid|gclid|gbraid|wbraid|msclkid|mc_[a-z]+|_pos|_sid|_ss|_psq|_v|ref|ref_|srsltid|campid|customid|toolid|mkevt|mkcid|mkrid|sssrc|ssuid|widget_ver|stype|clickid|irclickid|cjevent|_branch_match_id)$/i;

function cleanUrl(u: URL): string {
  const q = new URLSearchParams();
  for (const [k, v] of u.searchParams) if (!TRACKING.test(k)) q.append(k, v);
  const qs = q.toString();
  return `${u.origin}${u.pathname}${qs ? `?${qs}` : ""}`;
}

function linkedFrom(store: string, title: string, url: string, extra: { brand?: string | null; partNumber?: string | null; priceCents?: number | null; count?: number | null }, from: LinkedPart["from"]): LinkedPart {
  const t = parseProductTitle(title, extra.brand ?? null);
  // A "Pack of 12" is 12 parts at the pack's price. A fluid's size comes from its title.
  const quantity = t.kind === "part" && extra.count && extra.count > 1 ? extra.count : t.quantity;
  return { store, ...t, partNumber: extra.partNumber ?? t.partNumber, quantity, priceCents: extra.priceCents ?? null, named: true, from, url };
}

/** An eBay listing, through eBay's API. Short ebay.us links are followed to the listing first. */
async function fromEbay(u: URL): Promise<LinkedPart> {
  if (/^ebay\.us$/i.test(u.hostname)) u = (await getPublicPage(u, { maxBytes: 1 })).url;
  const id = u.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})(?:$|[/?])/)?.[1] ?? u.searchParams.get("item");
  if (!id || !/^\d{9,15}$/.test(id)) throw bad("That eBay link isn't a listing. Open the item, then copy its link.");
  const variation = u.searchParams.get("var");
  const clean = `https://www.ebay.com/itm/${id}${variation && /^\d+$/.test(variation) ? `?var=${variation}` : ""}`;
  const item = await ebayItem(id, variation && /^\d+$/.test(variation) ? variation : null, clean);
  if (item) return linkedFrom("eBay", item.title, item.url, item, "page");
  const words = fromSlug(u);
  if (words) return { store: "eBay", kind: "part", quantity: null, unit: null, ...words, from: "link", url: clean };
  throw new HttpError(422, "eBay doesn't let apps read its pages. Take a screenshot of the listing and use Read a screenshot, or ask your admin to add eBay keys on the Admin page.");
}

/** Any other shop: read the page it serves NitroLog, for the details it publishes for search engines. */
async function fromAnyStore(u: URL): Promise<LinkedPart> {
  checkPublicUrl(u);
  const page = await getPublicPage(u);
  const host = page.url.hostname.replace(/^www\./, "");
  const clean = cleanUrl(page.url);
  const info = page.status >= 200 && page.status < 300 ? readProductPage(page.html) : null;
  if (info) {
    // Only US dollars are taken as a price, since that's what the form is in.
    const price = info.currency && info.currency.toUpperCase() !== "USD" ? null : info.priceCents;
    return linkedFrom(info.site ?? host, info.title, clean, { ...info, priceCents: price }, "page");
  }
  const blocked = page.status === 403 || page.status === 429 || page.status === 503 || isChallengePage(page.html);
  const words = fromSlug(page.url);
  if (words && page.status !== 404 && page.status !== 410) return { store: host, kind: "part", quantity: null, unit: null, ...words, from: "link", url: clean };
  if (blocked) throw new HttpError(422, `${host} doesn't let apps read its pages. Take a screenshot of the product and use Read a screenshot instead.`);
  if (page.status === 404 || page.status === 410) throw new HttpError(422, `${host} says that page doesn't exist. Check the link.`);
  if (page.status === 0) throw new HttpError(422, `Couldn't open ${host}. Check the link, or take a screenshot and use Read a screenshot.`);
  throw new HttpError(422, `${host} didn't describe a product on that page. Take a screenshot and use Read a screenshot instead.`);
}

/**
 * Reads a pasted link. When NitroLog can't get the full details itself (the store refuses apps, or shows no price),
 * and a Gemini key is set, Gemini is asked to read the page, and what it finds fills the gaps. `mayUseAi` is
 * asked first, so the caller can limit how often that happens.
 */
export async function partFromLink(raw: unknown, mayUseAi: () => boolean = () => false): Promise<LinkedPart> {
  let result: LinkedPart | null = null;
  let failure: HttpError | null = null;
  try { result = await readLink(raw); }
  catch (e) {
    // 422 means the store said no or didn't describe a product. Anything else, like a bad link, is final.
    if (!(e instanceof HttpError) || e.status !== 422) throw e;
    failure = e;
  }
  const incomplete = !result || result.from === "link" || result.priceCents === null;
  if (incomplete && geminiEnabled() && mayUseAi()) {
    const url = result?.url ?? cleanUrl(new URL((raw as string).match(/https?:\/\/\S+/)?.[0] ?? (raw as string).trim()));
    const ai = await readLinkWithAi(url).catch(() => null);
    if (ai) {
      const host = new URL(url).hostname.replace(/^www\./, "");
      // A page NitroLog read itself keeps its own details. Words from a link give way to what Gemini read on the page.
      const own = result && result.from !== "link" ? result : null;
      return {
        store: result?.store ?? ai.store ?? host,
        kind: own?.kind ?? ai.kind,
        name: own?.name ?? ai.name,
        brand: own?.brand ?? ai.brand ?? result?.brand ?? null,
        partNumber: own?.partNumber ?? ai.partNumber ?? result?.partNumber ?? null,
        quantity: own?.quantity ?? ai.quantity,
        unit: own?.unit ?? ai.unit,
        priceCents: result?.priceCents ?? ai.priceCents,
        named: true,
        from: "ai",
        url,
      };
    }
  }
  if (result) return result;
  throw failure!;
}

async function readLink(raw: unknown): Promise<LinkedPart> {
  if (typeof raw !== "string" || raw.length > 2000) throw bad("Paste a link to the product's page.");
  // Phones often share "Product name https://…", so find the link inside whatever was pasted.
  const found = raw.match(/https?:\/\/\S+/)?.[0] ?? raw.trim();
  let u: URL;
  try { u = new URL(found); } catch { throw bad("That isn't a link. Copy the product page's link from your browser or the store's app."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw bad("Links need to start with http:// or https://");
  const store = storeOf(u);
  if (!store) return fromAnyStore(u);
  if (store === "eBay") return fromEbay(u);
  if (store === "Amazon" && SHORT.test(u.hostname.toLowerCase())) u = await expandShortLink(u);
  const clean = `${u.origin}${u.pathname}`;
  if (store === "Amazon") {
    const page = await amazonPage(new URL(clean));
    if (page) return linkedFrom("Amazon", page.title, clean, page, "title");
  }
  // AutoZone and O'Reilly refuse apps, so their details come from the words in the link.
  const part = store === "AutoZone" ? fromAutoZone(u) : store === "O'Reilly" ? fromOReilly(u) : fromAmazon(u);
  return { store, kind: "part", quantity: null, unit: null, ...part, from: "link", url: clean };
}
