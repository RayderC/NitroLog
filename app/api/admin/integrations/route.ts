import { bad, route } from "@/lib/api";
import { ebayStatus, resetEbay } from "@/lib/ebay";
import { geminiStatus } from "@/lib/gemini";
import { setSetting } from "@/lib/settings";

const status = () => ({ ebay: ebayStatus(), gemini: geminiStatus() });

/** Optional services and whether they're set up. Keys never leave the server, only their last few characters. */
export const GET = route(() => status(), { admin: true });

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
  if (b.gemini !== undefined) {
    if (b.gemini === null) setSetting("gemini_api_key", null);
    else {
      const key = typeof b.gemini?.apiKey === "string" ? b.gemini.apiKey.trim() : "";
      // New keys start with "AQ." and older ones with "AIza"; both are letters, digits, dots, dashes and underscores.
      if (!/^[\w.\-]{20,300}$/.test(key)) throw bad("That doesn't look like a Gemini key. Copy the whole key from AI Studio.");
      setSetting("gemini_api_key", key);
    }
  }
  return status();
}, { admin: true });
