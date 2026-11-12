import { bad, route } from "@/lib/api";
import { saveSsoConfig, ssoConfig } from "@/lib/sso";
import { amethystOrigin, isGoodSecret } from "@/lib/ssoCore";

const status = () => {
  const c = ssoConfig();
  return { enabled: !!c, url: c?.url ?? null, hint: c ? c.secret.slice(-4) : null, fromEnv: !!c?.fromEnv };
};

export const GET = route(() => status(), { admin: true });

/** PUT { url, secret } turns it on; PUT { off: true } turns it off. */
export const PUT = route(({ body }) => {
  if (body?.off) { saveSsoConfig(null); return status(); }
  const url = amethystOrigin(body?.url);
  if (!url) throw bad("Put in Amethyst's address, like rayder.xyz or http://192.168.1.5:3000");
  const secret = String(body?.secret ?? "").trim();
  if (!isGoodSecret(secret)) throw bad("Paste the whole shared secret from Amethyst (Dashboard → System)");
  saveSsoConfig({ url, secret });
  return status();
}, { admin: true });
