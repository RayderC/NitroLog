// Turns a store's product title into part fields, for the link reader in lib/productLink.ts.

/** Brands as they're spelled in store links, mapped to how they're written. */
export const BRANDS: Record<string, string> = {
  "k-n": "K&N", kn: "K&N", "k-and-n": "K&N", stp: "STP", wix: "WIX", fram: "FRAM", "mobil-1": "Mobil 1", mobil1: "Mobil 1", mobil: "Mobil",
  duralast: "Duralast", "duralast-gold": "Duralast Gold", bosch: "Bosch", acdelco: "ACDelco", "ac-delco": "ACDelco",
  motorcraft: "Motorcraft", mopar: "Mopar", valvoline: "Valvoline", castrol: "Castrol", pennzoil: "Pennzoil",
  "royal-purple": "Royal Purple", amsoil: "AMSOIL", purolator: "Purolator", champion: "Champion", ngk: "NGK", denso: "Denso",
  autolite: "Autolite", moog: "Moog", monroe: "Monroe", bilstein: "Bilstein", kyb: "KYB", gates: "Gates", dayco: "Dayco",
  brembo: "Brembo", wagner: "Wagner", raybestos: "Raybestos", akebono: "Akebono", "power-stop": "Power Stop", powerstop: "Power Stop",
  hawk: "Hawk", ebc: "EBC", centric: "Centric", prestone: "Prestone", peak: "Peak", "rain-x": "Rain-X", "lucas-oil": "Lucas Oil",
  lucas: "Lucas", "sea-foam": "Sea Foam", brakebest: "BrakeBest", "brakebest-select": "BrakeBest Select", precision: "Precision",
  microgard: "MicroGard", "super-start": "Super Start", "import-direct": "Import Direct", ultima: "Ultima", murray: "Murray",
  omnispark: "OmniSpark", valucraft: "Valucraft", spectre: "Spectre", edelbrock: "Edelbrock", dorman: "Dorman", standard: "Standard",
  walker: "Walker", magnaflow: "MagnaFlow", flowmaster: "Flowmaster", "liqui-moly": "Liqui Moly", "quaker-state": "Quaker State",
  "red-line": "Red Line", motul: "Motul", shell: "Shell", "rotella": "Rotella", "chevron": "Chevron", "havoline": "Havoline",
  "hastings": "Hastings", "mann-filter": "MANN-FILTER", mann: "MANN", mahle: "MAHLE", "wd-40": "WD-40", "permatex": "Permatex",
  "3m": "3M", "meguiars": "Meguiar's", "chemical-guys": "Chemical Guys", "optima": "Optima", "interstate": "Interstate",
  "michelin": "Michelin", "goodyear": "Goodyear", "bridgestone": "Bridgestone", "cooper": "Cooper", "detroit-axle": "Detroit Axle",
  "a-premium": "A-Premium", "acdelco-gold": "ACDelco Gold", "bosch-icon": "Bosch ICON", "trico": "TRICO", "anco": "ANCO",
};

/** Display spellings, longest first, so "Mobil 1" wins over "Mobil". */
const DISPLAY = [...new Set(Object.values(BRANDS))].sort((a, b) => b.length - a.length);

export type TitleParts = {
  name: string;
  brand: string | null;
  partNumber: string | null;
  quantity: number | null;
  unit: string | null;
  kind: "part" | "fluid";
};

const UNITS: [RegExp, string][] = [
  [/^(quarts?|qts?)$/i, "qt"], [/^(gallons?|gals?)$/i, "gal"], [/^(liters?|litres?|l)$/i, "L"],
  [/^(fl\.?\s*oz|ounces?|oz)$/i, "oz"], [/^(ml|milliliters?)$/i, "ml"],
];

/**
 * "K&N Select Oil Filter: Designed to Protect your Engine, SO-2010 | Fits Select …" →
 * brand K&N, name "Select Oil Filter", part number SO-2010.
 */
export function parseProductTitle(raw: string, brandHint?: string | null): TitleParts {
  let t = raw.replace(/\s+/g, " ").trim()
    .replace(/^Amazon\.com\s*:\s*/i, "")
    // Amazon ends page titles with the department: "… : Automotive".
    .replace(/\s*:\s*(Automotive|Industrial & Scientific|Tools & Home Improvement|Home & Kitchen|Sports & Outdoors)\s*$/i, "")
    .replace(/\s*[|–-]\s*(AutoZone|O'Reilly Auto Parts|Advance Auto Parts|Walmart\.com|NAPA.*)$/i, "");
  // Everything after " | " or "Fits"/"Compatible with" is fitment lists.
  const head = t.split(/\s\|\s|\bfits\b|\bcompatible with\b/i)[0].trim();

  let brand: string | null = brandHint?.trim() || null;
  if (!brand) brand = DISPLAY.find(b => head.toLowerCase().startsWith(b.toLowerCase() + " ") || head.toLowerCase() === b.toLowerCase()) ?? null;

  // Letters and digits together, like SO-2010, HP-1017, PH7317, XG7317, 51307-XP. Skips oil grades like 5W-30.
  const pn = head.match(/\b(?!\d{1,2}W-?\d{2}\b)([A-Z]{1,5}-?\d{2,}[A-Z0-9-]*|\d{3,}-?[A-Z]{1,4}\d*)\b/);
  const partNumber = pn ? pn[1] : null;

  // Size, for fluids: "5 Quart", "1 Gallon", "32 oz".
  let quantity: number | null = null, unit: string | null = null;
  const size = head.match(/\b(\d+(?:\.\d+)?)\s*-?\s*(quarts?|qts?|gallons?|gals?|liters?|litres?|l|fl\.?\s*oz|ounces?|oz|ml)\b/i);
  if (size) {
    quantity = Number(size[1]);
    unit = UNITS.find(([re]) => re.test(size[2].replace(/\s+/g, " ")))?.[1] ?? null;
  }

  // The name is the first phrase, without the brand, part number or size.
  let name = head.split(/:\s|,\s|\s-\s|\s\(/)[0];
  if (brand && name.toLowerCase().startsWith(brand.toLowerCase())) name = name.slice(brand.length);
  if (partNumber) name = name.replace(partNumber, "");
  if (size) name = name.replace(size[0], "");
  name = name.replace(/\s+/g, " ").replace(/^[\s,:-]+|[\s,:-]+$/g, "").slice(0, 120);
  if (!name) name = head.slice(0, 120);

  const fluid = /\b(oil|fluid|coolant|antifreeze|grease|atf|lubricant|cleaner|additive)\b/i.test(head) && !/\bfilter\b/i.test(name);
  return { name, brand, partNumber, quantity, unit, kind: fluid ? "fluid" : "part" };
}

/** "$17.99" or "17,99 €" → 1799. */
export function priceToCents(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.replace(/,(?=\d{3}\b)/g, "").match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const cents = Math.round(Number(m[1].replace(",", ".")) * 100);
  return cents > 0 && cents < 10_000_000 ? cents : null;
}
