// Reads parts off a screenshot or a photo of a receipt with Google's Gemini API, which has a free tier.
// Off until an admin pastes a key in on the Admin page, or GEMINI_API_KEY is set.
import { HttpError } from "./api";
import { getSetting, keyHint } from "./settings";

/** The container's environment wins, so a key set there can't be changed from the app. */
function apiKey(): { key: string; source: "env" | "app" } | null {
  if (process.env.GEMINI_API_KEY) return { key: process.env.GEMINI_API_KEY, source: "env" };
  const k = getSetting("gemini_api_key");
  return k ? { key: k, source: "app" } : null;
}

export const geminiEnabled = () => apiKey() !== null;

export function geminiStatus() {
  const k = apiKey();
  return { configured: !!k, source: k?.source ?? null, hint: keyHint(k?.key) };
}

/** An alias Google keeps pointed at its current Flash-Lite model: fast, and the biggest free allowance. */
const model = () => (process.env.GEMINI_MODEL || "gemini-flash-lite-latest").replace(/[^a-z0-9.\-]/gi, "");
/** Used when the main model is overloaded. Also free. */
const FALLBACK_MODEL = "gemini-flash-latest";

export type ImagePart = {
  name: string;
  brand: string | null;
  partNumber: string | null;
  quantity: number | null;
  unit: string | null;
  kind: "part" | "fluid";
  /** What that line cost in total, in cents. */
  priceCents: number | null;
  url: string | null;
};

export type ImageRead = { store: string | null; parts: ImagePart[] };

const PROMPT = `This image is one of: a screenshot of a product page from an online store, a shopping cart or order confirmation, or a photo of a printed store receipt. The products are vehicle parts, fluids, tools or accessories.
List every product in it. For each one give:
- name: the product's short name without the brand or part number, like "Performance Camshaft Kit", "Front Bumper Cover", "Oil Filter", "Full Synthetic Motor Oil 5W-30".
- brand: the maker, if shown.
- partNumber: the manufacturer part number, model number or SKU, if shown.
- quantity: how many were bought. For a fluid, the total volume instead (a 5 quart jug is 5; two 1 gallon jugs are 2).
- unit: for fluids, "qt", "gal", "L" or "oz". Otherwise empty.
- kind: "fluid" for oil, coolant, brake fluid, transmission fluid and the like. Otherwise "part".
- price: what that line cost in total, as a plain number in the image's currency (19.99, not "$19.99"). For a product page, the current price shown. Leave it empty if no price is shown.
- url: the product's web address only if it's written in the image.
Leave out tax, shipping, fees, discounts, coupons, deposits, gift cards and totals. Leave out anyone's name, address, phone number or card number.
store: the store or website name, if shown.
If there are no products, return an empty list.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    store: { type: "STRING", nullable: true },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          brand: { type: "STRING", nullable: true },
          partNumber: { type: "STRING", nullable: true },
          quantity: { type: "NUMBER", nullable: true },
          unit: { type: "STRING", nullable: true },
          kind: { type: "STRING", enum: ["part", "fluid"] },
          price: { type: "NUMBER", nullable: true },
          url: { type: "STRING", nullable: true },
        },
        required: ["name", "kind"],
      },
    },
  },
  required: ["items"],
};

const s = (v: unknown, max: number) => (typeof v === "string" && v.trim() && !/^(null|n\/a|none|unknown)$/i.test(v.trim()) ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
const n = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v < max ? v : null);

/** Gemini's answer, checked: text is trimmed and capped, numbers must be sensible, links must be http or https. */
export function cleanImageRead(j: unknown): ImageRead {
  const o = (j && typeof j === "object" ? j : {}) as { store?: unknown; items?: unknown };
  const items = Array.isArray(o.items) ? o.items.slice(0, 40) : [];
  const parts = items.flatMap((x): ImagePart[] => {
    const i = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const name = s(i.name, 160);
    if (!name) return [];
    const url = s(i.url, 2000);
    const price = n(i.price, 100_000);
    const unit = s(i.unit, 20);
    return [{
      name, brand: s(i.brand, 80), partNumber: s(i.partNumber, 60),
      quantity: n(i.quantity, 100_000), unit: unit && /^(qt|gal|l|oz|ml)$/i.test(unit) ? (unit.toLowerCase() === "l" ? "L" : unit.toLowerCase()) : null,
      kind: i.kind === "fluid" ? "fluid" : "part",
      priceCents: price === null ? null : Math.round(price * 100),
      url: url && /^https?:\/\/[^\s]+$/i.test(url) ? url : null,
    }];
  });
  return { store: s(o.store, 80), parts };
}

/** Sends one image to Gemini and returns the parts it lists. */
export async function readPartsImage(bytes: Buffer, mime: string): Promise<ImageRead> {
  const key = apiKey();
  if (!key) throw new HttpError(400, "Reading screenshots isn't set up. An admin can add a free Gemini key on the Admin page.");
  const body = JSON.stringify({
    contents: [{ parts: [{ inline_data: { mime_type: mime, data: bytes.toString("base64") } }, { text: PROMPT }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: "application/json", responseSchema: SCHEMA },
  });
  const ask = (m: string) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key.key }, body, signal: AbortSignal.timeout(60_000),
  });

  // Free-tier models are often briefly overloaded (503). Try again once, then the other model.
  const attempts = [model(), model(), FALLBACK_MODEL].filter((m, i, a) => i < 2 || m !== a[0]);
  let res: Response | null = null;
  for (const [i, m] of attempts.entries()) {
    try { res = await ask(m); } catch { res = null; }
    if (res && res.status !== 503 && res.status !== 500) break;
    console.warn(`[gemini] ${m} answered ${res?.status ?? "no response"}`);
    if (i < attempts.length - 1) await new Promise(r => setTimeout(r, 1500));
  }
  if (!res) throw new HttpError(502, "Couldn't reach Gemini. Try again in a moment.");
  if (!res.ok) {
    console.warn(`[gemini] answered ${res.status}`);
    if (res.status === 429) throw new HttpError(429, "Gemini's free limit is used up for now. Try again later, or tomorrow.");
    if (res.status === 400 || res.status === 403) throw new HttpError(502, "Gemini didn't accept the key or the picture. Check the key on the Admin page.");
    if (res.status === 404) throw new HttpError(502, "That Gemini model doesn't exist. Check GEMINI_MODEL.");
    throw new HttpError(503, "Gemini is busy right now. Try again in a minute.");
  }
  const j = await res.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  const text = (j.candidates?.[0]?.content?.parts ?? []).filter(x => !x.thought).map(x => x.text ?? "").join("");
  try { return cleanImageRead(JSON.parse(text)); }
  catch { throw new HttpError(502, "Gemini's answer didn't make sense. Try again, or crop the picture to the parts."); }
}

/** Checks the key and model by looking the model up, which doesn't use up any of the free allowance. */
export async function testGeminiKey(): Promise<string> {
  const key = apiKey();
  if (!key) throw new HttpError(400, "Save a key first.");
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model()}`, { headers: { "x-goog-api-key": key.key }, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new HttpError(502, "Couldn't reach Google. Check the server's internet connection.");
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new HttpError(400, "Google didn't accept that key. Copy it again from AI Studio, the whole thing.");
  if (res.status === 404) throw new HttpError(400, `The key works, but the model "${model()}" doesn't exist. Check GEMINI_MODEL.`);
  if (!res.ok) throw new HttpError(502, `Google answered ${res.status}. Try again in a minute.`);
  const j = await res.json() as { displayName?: string };
  return `It works. Screenshots will be read by ${j.displayName ?? model()}.`;
}
