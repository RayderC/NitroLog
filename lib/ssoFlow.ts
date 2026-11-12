import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "./db";
import { getSession } from "./api";
import { recordSignIn } from "./signIns";
import { SSO_APP, ssoConfig } from "./sso";
import { originFrom, verifyPass } from "./ssoCore";

// The two halves of "Sign in with Amethyst": off to Amethyst, and back with a pass.
const COOKIE = "nitrolog_sso_state";

/** GET /api/sso?start=1: remembers this attempt in a cookie and sends the browser to Amethyst. */
export function startSso(req: NextRequest): NextResponse {
  const cfg = ssoConfig();
  const origin = originFrom(n => req.headers.get(n));
  if (!cfg) return NextResponse.redirect(new URL("/login?sso_error=Sign+in+with+Amethyst+isn%27t+set+up", origin));
  const state = crypto.randomBytes(24).toString("base64url");
  const to = new URL("/sso", cfg.url);
  to.search = new URLSearchParams({ app: SSO_APP, return: `${origin}/api/sso/callback`, state }).toString();
  const res = NextResponse.redirect(to);
  res.cookies.set(COOKIE, state, { httpOnly: true, sameSite: "lax", path: "/api/sso", maxAge: 600, secure: origin.startsWith("https:") });
  return res;
}

/** Shared by the callback route: checks the pass and signs the person in. */
export async function finishSso(req: NextRequest): Promise<NextResponse> {
  const origin = originFrom(n => req.headers.get(n));
  const fail = (msg: string) => {
    const r = NextResponse.redirect(new URL(`/login?sso_error=${encodeURIComponent(msg)}`, origin));
    r.cookies.delete({ name: COOKIE, path: "/api/sso" });
    return r;
  };
  const cfg = ssoConfig();
  if (!cfg) return fail("Sign in with Amethyst isn't set up here.");
  const q = req.nextUrl.searchParams;
  const cookie = req.cookies.get(COOKIE)?.value ?? "";
  if (!cookie || cookie !== q.get("state")) return fail("That sign-in didn't start here. Try again.");
  let sub: string;
  try { sub = verifyPass(cfg.secret, q.get("token"), { aud: origin, nonce: cookie, app: SSO_APP }).sub; }
  catch (e) { return fail((e as Error).message); }
  const user = db.prepare("SELECT id, username, disabled, token_version FROM users WHERE username = ? COLLATE NOCASE").get(sub) as
    { id: number; username: string; disabled: number; token_version: number } | undefined;
  if (!user) return fail(`There's no NitroLog account named "${sub}". Ask an admin to make one with that name.`);
  if (user.disabled) return fail("That account is turned off.");
  const session = await getSession();
  session.user = { id: user.id, username: user.username, v: user.token_version };
  await session.save();
  recordSignIn(user.id, req);
  const res = NextResponse.redirect(new URL("/", origin));
  res.cookies.delete({ name: COOKIE, path: "/api/sso" });
  return res;
}
