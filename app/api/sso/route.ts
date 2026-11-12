import { NextRequest, NextResponse } from "next/server";
import { ssoConfig } from "@/lib/sso";
import { startSso } from "@/lib/ssoFlow";

// GET /api/sso: { enabled }, for the login page. GET /api/sso?start=1: off to Amethyst to sign in.
export function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("start")) return startSso(req);
  return NextResponse.json({ enabled: !!ssoConfig() });
}
