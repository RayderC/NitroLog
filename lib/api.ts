import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionUser } from "./session";
import { db } from "./db";
import { checkRateLimit } from "./rateLimit";

export type UserRow = {
  id: number;
  username: string;
  is_admin: number;
  disabled: number;
  token_version: number;
  distance_unit: "mi" | "km";
  volume_unit: "gal" | "L";
  created_at: string;
};

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const bad = (msg: string) => new HttpError(400, msg);
export const notFound = (msg = "Not found") => new HttpError(404, msg);

export async function getSession() {
  return getIronSession<{ user?: SessionUser }>(await cookies(), sessionOptions);
}

export function sameOrigin(req: NextRequest) {
  // Browsers set this themselves and pages can't fake it. It stays right when a proxy or tunnel rewrites Host.
  if (req.headers.get("sec-fetch-site") === "same-origin") return true;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try { return new URL(origin).host === host; } catch { return false; }
}

/**
 * Behind a Cloudflare Tunnel every request arrives from the tunnel, so use the address Cloudflare reports.
 * X-Forwarded-For is deliberately not trusted first: a client can set its leftmost entry to dodge rate limits.
 */
export function clientIp(req: NextRequest) {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  return req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "local";
}

type Ctx<P> = { req: NextRequest; user: UserRow; params: P; body: any };
type RouteOpts = { admin?: boolean };

/** Wraps a route handler with auth, CSRF, JSON parsing and error handling. */
export function route<P = Record<string, string>>(
  handler: (ctx: Ctx<P>) => unknown | Promise<unknown>,
  opts: RouteOpts = {},
) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      if (req.method !== "GET" && !sameOrigin(req)) throw new HttpError(403, "Bad origin");
      const session = await getSession();
      if (!session.user) throw new HttpError(401, "Not signed in");
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.user.id) as UserRow | undefined;
      if (!user || user.disabled || user.token_version !== session.user.v) {
        session.destroy();
        throw new HttpError(401, "Not signed in");
      }
      if (opts.admin && !user.is_admin) throw new HttpError(403, "Admins only");
      if (req.method !== "GET" && !checkRateLimit(`w:${user.id}`, 600, 60_000)) throw new HttpError(429, "Slow down");

      let body: any = undefined;
      if (req.method !== "GET" && req.method !== "DELETE") {
        const ct = req.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) body = await req.json().catch(() => { throw bad("Invalid JSON"); });
      }
      const params = (await context.params) ?? ({} as P);
      const result = await handler({ req, user, params, body });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ message: e.message }, { status: e.status });
      console.error("[api]", req.method, req.nextUrl.pathname, e);
      return NextResponse.json({ message: "Server error" }, { status: 500 });
    }
  };
}

// ── Input parsing. Each throws a 400 with a readable message. ──

export function int(v: unknown, name = "id"): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw bad(`Invalid ${name}`);
  return n;
}

/** Trimmed text, or null when empty. */
export function text(v: unknown, max = 200): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw bad("Expected text");
  const t = v.trim().slice(0, max);
  return t === "" ? null : t;
}

export function requiredText(v: unknown, name: string, max = 200): string {
  const t = text(v, max);
  if (!t) throw bad(`${name} is required`);
  return t;
}

export function numOrNull(v: unknown, name = "number", max = 1e12): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!isFinite(n) || n < 0 || n > max) throw bad(`Invalid ${name}`);
  return n;
}

export function cents(v: unknown): number {
  const n = numOrNull(v, "amount", 1e12);
  if (n === null) return 0;
  if (!Number.isInteger(n)) throw bad("Invalid amount");
  return n;
}

export function day(v: unknown, name = "date"): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad(`Invalid ${name}`);
  const d = new Date(`${v}T00:00:00Z`);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw bad(`Invalid ${name}`);
  return v;
}

/** The viewer's local day from `?today=`, because "what's due today" depends on their time zone. */
export function todayParam(req: NextRequest): string {
  const t = req.nextUrl.searchParams.get("today");
  return t ? day(t, "today") : new Date().toISOString().slice(0, 10);
}
