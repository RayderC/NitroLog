import { NextResponse } from "next/server";
import { getSession } from "@/lib/api";

export async function POST() {
  (await getSession()).destroy();
  return NextResponse.json({ ok: true });
}
