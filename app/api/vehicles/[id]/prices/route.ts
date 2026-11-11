import { HttpError, int, route } from "@/lib/api";
import { lookupPrices } from "@/lib/ebay";
import { checkRateLimit } from "@/lib/rateLimit";
import { requireVehicle } from "@/lib/repo/vehicles";

type P = { id: string };

/** Current eBay prices for a part, matched to this vehicle where eBay knows the fit. */
export const GET = route<P>(async ({ req, user, params }) => {
  const v = requireVehicle(user.id, int(params.id));
  const q = req.nextUrl.searchParams.get("q") ?? "";
  // Each lookup costs one of eBay's daily calls, so keep any one person from using them all up.
  if (!checkRateLimit(`ebay:${user.id}`, 30, 60_000)) throw new HttpError(429, "Too many price lookups. Try again in a minute.");
  return lookupPrices(q, v);
});
