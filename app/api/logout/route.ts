import { NextRequest, NextResponse } from "next/server";
import { getSession, sameOrigin } from "@/lib/api";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ message: "Bad origin" }, { status: 403 });
  (await getSession()).destroy();
  return NextResponse.json({ ok: true });
}
