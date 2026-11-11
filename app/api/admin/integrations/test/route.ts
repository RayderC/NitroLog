import { HttpError, route } from "@/lib/api";
import { ebayEnabled, lookupPrices } from "@/lib/ebay";
import { checkRateLimit } from "@/lib/rateLimit";

/** Runs one real eBay search so the admin knows the keys work. */
export const POST = route(async ({ user }) => {
  if (!checkRateLimit(`ebaytest:${user.id}`, 10, 60_000)) throw new HttpError(429, "Wait a minute before testing again.");
  if (!ebayEnabled()) throw new HttpError(400, "Save the keys first.");
  const r = await lookupPrices("oil filter", { year: null, make: null, model: null }, true);
  if (!r.results.length) return { message: "The keys work, but eBay returned no listings for a test search. Try a real part on a service record." };
  return { message: `It works. A test search for an oil filter found ${r.results.length} listings from $${(r.lowCents! / 100).toFixed(2)}.` };
}, { admin: true });
