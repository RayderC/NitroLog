// Fills in a part from a store link you paste. Product links at Amazon, AutoZone and O'Reilly spell out
// the product, so this reads the link itself and never the store's page: those stores don't offer apps a
// way to read their pages or prices, so the price is typed by hand. Live prices come from eBay's API instead.
import { HttpError, bad } from "./api";

export type LinkedPart = {
  store: "Amazon" | "AutoZone" | "O'Reilly";
  name: string;
  brand: string | null;
  partNumber: string | null;
  /** Always null: store pages aren't read. Kept so the form can take a price if a source ever offers one. */
  priceCents: number | null;
  /** True when the link named the product. False for a bare Amazon link, where the name has to be typed. */
  named: boolean;
  url: string;
};

const STORES: { store: LinkedPart["store"]; hosts: RegExp }[] = [
  { store: "Amazon", hosts: /^(www\.|smile\.)?amazon\.com$|^(a\.co|amzn\.to|amzn\.com)$/ },
  { store: "AutoZone", hosts: /^(www\.)?autozone\.com$/ },
  { store: "O'Reilly", hosts: /^(www\.)?oreillyauto\.com$/ },
];
const SHORT = /^(a\.co|amzn\.to|amzn\.com)$/;

/** Brands as they're spelled in store links, mapped to how they're written. Unknown brands stay blank. */
const BRANDS: Record<string, string> = {
  "k-n": "K&N", kn: "K&N", stp: "STP", wix: "WIX", fram: "FRAM", "mobil-1": "Mobil 1", mobil1: "Mobil 1", mobil: "Mobil",
  duralast: "Duralast", "duralast-gold": "Duralast Gold", bosch: "Bosch", acdelco: "ACDelco", "ac-delco": "ACDelco",
  motorcraft: "Motorcraft", mopar: "Mopar", valvoline: "Valvoline", castrol: "Castrol", pennzoil: "Pennzoil",
  "royal-purple": "Royal Purple", amsoil: "AMSOIL", purolator: "Purolator", champion: "Champion", ngk: "NGK", denso: "Denso",
  autolite: "Autolite", moog: "Moog", monroe: "Monroe", bilstein: "Bilstein", kyb: "KYB", gates: "Gates", dayco: "Dayco",
  brembo: "Brembo", wagner: "Wagner", raybestos: "Raybestos", akebono: "Akebono", "power-stop": "Power Stop", powerstop: "Power Stop",
  hawk: "Hawk", ebc: "EBC", centric: "Centric", prestone: "Prestone", peak: "Peak", "rain-x": "Rain-X", "lucas-oil": "Lucas Oil",
  lucas: "Lucas", "sea-foam": "Sea Foam", brakebest: "BrakeBest", "brakebest-select": "BrakeBest Select", precision: "Precision",
  microgard: "MicroGard", "super-start": "Super Start", "import-direct": "Import Direct", ultima: "Ultima", murray: "Murray",
  omnispark: "OmniSpark", valucraft: "Valucraft", spectre: "Spectre", edelbrock: "Edelbrock", dorman: "Dorman", standard: "Standard",
  walker: "Walker", magnaflow: "MagnaFlow", flowmaster: "Flowmaster", "liqui-moly": "Liqui Moly", "k-and-n": "K&N",
};

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

type Parsed = Omit<LinkedPart, "url" | "store">;

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
  const { brand, rest } = takeBrand(words);
  const { partNumber, rest: name } = takePartNumber(rest);
  return { name: title(name).slice(0, 160) || "Amazon item", brand, partNumber, priceCents: null, named: name.length > 0 };
}

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
      res = await fetch(url, { method: "HEAD", redirect: "manual", headers: { "User-Agent": "NitroLog link reader" }, signal: AbortSignal.timeout(8000) });
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

export async function partFromLink(raw: unknown): Promise<LinkedPart> {
  if (typeof raw !== "string" || raw.length > 2000) throw bad("Paste a link from Amazon, AutoZone or O'Reilly.");
  // Phones often share "Product name https://…", so find the link inside whatever was pasted.
  const found = raw.match(/https?:\/\/\S+/)?.[0] ?? raw.trim();
  let u: URL;
  try { u = new URL(found); } catch { throw bad("That isn't a link. Copy the product's link from Amazon, AutoZone or O'Reilly."); }
  const store = storeOf(u);
  if (!store) throw bad("Only Amazon, AutoZone and O'Reilly links work for now.");
  if (store === "Amazon" && SHORT.test(u.hostname.toLowerCase())) u = await expandShortLink(u);
  const part = store === "AutoZone" ? fromAutoZone(u) : store === "O'Reilly" ? fromOReilly(u) : fromAmazon(u);
  // Drop tracking and session bits before handing the link back.
  return { store, ...part, url: `${u.origin}${u.pathname}` };
}
