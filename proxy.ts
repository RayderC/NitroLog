import { getIronSession } from "iron-session";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { sessionOptions, type SessionUser } from "./lib/session";

// Server-side auth gate for every app page. API routes check auth themselves (lib/api.ts).
export async function proxy(req: NextRequest) {
  const res = NextResponse.next();
  try {
    const session = await getIronSession<{ user?: SessionUser }>(req, res, sessionOptions);
    if (!session.user) return NextResponse.redirect(new URL("/login", req.url));
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return res;
}

export const config = {
  matcher: ["/((?!login|setup|api|_next|favicon|manifest|sw\\.js|offline\\.html|icons).*)"],
};
