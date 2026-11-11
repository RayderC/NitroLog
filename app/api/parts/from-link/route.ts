import { HttpError, route } from "@/lib/api";
import { partFromLink } from "@/lib/productLink";
import { checkRateLimit } from "@/lib/rateLimit";

/** Reads a pasted Amazon, AutoZone or O'Reilly link and returns the part's details. */
export const POST = route(async ({ user, body }) => {
  if (!checkRateLimit(`link:${user.id}`, 20, 60_000)) throw new HttpError(429, "Too many links at once. Try again in a minute.");
  return partFromLink(body?.url);
});
