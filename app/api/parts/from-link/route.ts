import { HttpError, route } from "@/lib/api";
import { partFromLink } from "@/lib/productLink";
import { checkRateLimit } from "@/lib/rateLimit";

/** Reads a pasted store link and returns the part's details. */
export const POST = route(async ({ user, body }) => {
  if (!checkRateLimit(`link:${user.id}`, 20, 60_000)) throw new HttpError(429, "Too many links at once. Try again in a minute.");
  // Asking Gemini to read a page is slower and uses the free allowance, so it has its own, smaller limit.
  return partFromLink(body?.url, () => checkRateLimit(`ailink:${user.id}`, 15, 10 * 60_000));
});
