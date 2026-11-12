// "Sign in with Amethyst": Amethyst vouches for who you are with a short-lived signed pass, and the other app
// checks it with the secret both were given. The same file is in every app. Nothing here touches the network.
//
// The pass says: this username, for this app at this address, for this one sign-in attempt (nonce), for two minutes.
// The receiving app also checks the nonce against a cookie it set when you clicked the button, so nobody can
// slip someone else a pass.
import crypto from "crypto";

export type SsoPass = { v: 1; sub: string; app: string; aud: string; nonce: string; iat: number; exp: number };

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (secret: string, data: string) => crypto.createHmac("sha256", secret).update(data).digest();

export const SSO_TTL_S = 120;

/** A random secret to paste into each app. */
export const newSecret = () => crypto.randomBytes(32).toString("base64url");

export function isGoodSecret(s: unknown): s is string {
  return typeof s === "string" && s.trim().length >= 32 && s.trim().length <= 200;
}

export function signPass(secret: string, p: Omit<SsoPass, "v" | "iat" | "exp">, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const body = b64(JSON.stringify({ v: 1, ...p, iat, exp: iat + SSO_TTL_S } satisfies SsoPass));
  return `${body}.${b64(mac(secret, body))}`;
}

/** The pass, if it's genuine, unexpired and meant for `aud` and `nonce`. Throws a readable message otherwise. */
export function verifyPass(secret: string, token: unknown, want: { aud: string; nonce: string; app: string }, now = Date.now()): SsoPass {
  if (typeof token !== "string" || token.length > 4000) throw new Error("The sign-in pass is missing.");
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("The sign-in pass is damaged.");
  const expected = mac(secret, body);
  const got = Buffer.from(sig, "base64url");
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) {
    throw new Error("The sign-in pass didn't check out. Make sure this app and Amethyst have the same shared secret.");
  }
  let p: SsoPass;
  try { p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { throw new Error("The sign-in pass is damaged."); }
  const t = Math.floor(now / 1000);
  if (p.v !== 1 || typeof p.sub !== "string" || !p.sub) throw new Error("The sign-in pass is damaged.");
  if (p.exp < t || p.iat > t + 60) throw new Error("The sign-in pass expired. Try again.");
  if (p.app !== want.app) throw new Error("That sign-in pass was for a different app.");
  if (p.aud !== want.aud) throw new Error("That sign-in pass was for a different address.");
  if (!want.nonce || p.nonce !== want.nonce) throw new Error("That sign-in didn't start here. Try again.");
  return p;
}

/** The address the browser used to reach this app, like http://192.168.1.5:7100. Tunnels and proxies are taken into account. */
export function originFrom(get: (name: string) => string | string[] | null | undefined, encrypted = false): string {
  const first = (v: string | string[] | null | undefined) => (Array.isArray(v) ? v[0] : v)?.split(",")[0].trim() || "";
  const proto = first(get("x-forwarded-proto")) || (encrypted ? "https" : "http");
  const host = first(get("x-forwarded-host")) || first(get("host"));
  return `${proto === "https" ? "https" : "http"}://${host}`;
}

/**
 * Amethyst's address as typed into the admin page or AMETHYST_URL: "rayder.xyz", "https://rayder.xyz/",
 * "http://192.168.1.5:3000/dashboard" all work. No scheme means https. Returns just the origin, or null.
 */
export function amethystOrigin(input: unknown): string | null {
  let s = typeof input === "string" ? input.trim() : "";
  if (!s || s.length > 500) return null;
  if (s.startsWith("//")) s = `https:${s}`;
  else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname || u.username || u.password) return null;
    return u.origin;
  } catch { return null; }
}
