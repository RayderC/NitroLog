import { HttpError, route } from "@/lib/api";
import { ebayEnabled, lookupPrices } from "@/lib/ebay";
import { testGeminiKey } from "@/lib/gemini";
import { checkRateLimit } from "@/lib/rateLimit";

/** Checks one service's key: `?service=gemini` looks the model up, and eBay runs one real search. */
export const POST = route(async ({ req, user }) => {
  if (!checkRateLimit(`keytest:${user.id}`, 10, 60_000)) throw new HttpError(429, "Wait a minute before testing again.");
  if (req.nextUrl.searchParams.get("service") === "gemini") return { message: await testGeminiKey() };
  if (!ebayEnabled()) throw new HttpError(400, "Save the keys first.");
  const r = await lookupPrices("oil filter", { year: null, make: null, model: null }, true);
  if (!r.results.length) return { message: "The keys work, but eBay returned no listings for a test search. Try a real part on a service record." };
  return { message: `It works. A test search for an oil filter found ${r.results.length} listings from $${(r.lowCents! / 100).toFixed(2)}.` };
}, { admin: true });
