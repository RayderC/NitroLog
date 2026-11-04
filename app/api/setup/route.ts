import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientIp, getSession, HttpError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rateLimit";
import { createUser } from "@/lib/repo/users";

const countUsers = () => (db.prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c;

export async function GET() {
  return NextResponse.json({ needsSetup: countUsers() === 0 });
}

export async function POST(req: NextRequest) {
  if (!checkRateLimit(`setup:${clientIp(req)}`, 10, 60_000)) return NextResponse.json({ message: "Slow down" }, { status: 429 });
  const { username, password, distanceUnit, volumeUnit } = await req.json().catch(() => ({}));
  try {
    // Checking and creating in one transaction means two simultaneous requests can't both become admin.
    const id = db.transaction(() => {
      if (countUsers() > 0) throw new HttpError(403, "Setup already complete");
      return createUser(username, password, true, { distance: distanceUnit, volume: volumeUnit });
    }).immediate();
    const session = await getSession();
    session.user = { id, username: String(username).trim().toLowerCase(), v: 0 };
    await session.save();
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  }
}
