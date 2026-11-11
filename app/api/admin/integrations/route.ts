import { bad, route } from "@/lib/api";
import { ebayStatus, resetEbay } from "@/lib/ebay";
import { setSetting } from "@/lib/settings";

/** Optional services and whether they're set up. Keys never leave the server, only their last few characters. */
export const GET = route(() => ({ ebay: ebayStatus() }), { admin: true });

export const PUT = route(({ body }) => {
  const b = body ?? {};
  if (b.ebay !== undefined) {
    if (b.ebay === null) {
      setSetting("ebay_client_id", null);
      setSetting("ebay_client_secret", null);
    } else {
      const id = typeof b.ebay?.clientId === "string" ? b.ebay.clientId.trim() : "";
      const secret = typeof b.ebay?.clientSecret === "string" ? b.ebay.clientSecret.trim() : "";
      // eBay's IDs are letters, digits and dashes.
      if (!/^[\w-]{10,200}$/.test(id) || !/^[\w-]{10,200}$/.test(secret)) throw bad("Those don't look like eBay keys. Copy the App ID and Cert ID from the Production column.");
      if (id === secret) throw bad("The App ID and Cert ID are the same. Copy each one into its own box.");
      setSetting("ebay_client_id", id);
      setSetting("ebay_client_secret", secret);
    }
    resetEbay();
  }
  return { ebay: ebayStatus() };
}, { admin: true });
