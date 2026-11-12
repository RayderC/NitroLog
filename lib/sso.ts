// "Sign in with Amethyst" settings: Amethyst's address and the shared secret, set on the Admin page
// (or AMETHYST_URL and AMETHYST_SSO_SECRET on the container).
import { getSetting, setSetting } from "./settings";
import { isGoodSecret } from "./ssoCore";

export const SSO_APP = "nitrolog";

export function ssoConfig(): { url: string; secret: string; fromEnv: boolean } | null {
  const envUrl = process.env.AMETHYST_URL, envSecret = process.env.AMETHYST_SSO_SECRET;
  if (envUrl && isGoodSecret(envSecret)) return { url: envUrl.replace(/\/+$/, ""), secret: envSecret.trim(), fromEnv: true };
  const url = getSetting("sso_url"), secret = getSetting("sso_secret");
  return url && isGoodSecret(secret) ? { url, secret: secret.trim(), fromEnv: false } : null;
}

export function saveSsoConfig(v: { url: string; secret: string } | null) {
  setSetting("sso_url", v ? v.url : null);
  setSetting("sso_secret", v ? v.secret : null);
}
