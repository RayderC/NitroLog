import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { clientIp, getSession } from "@/lib/api";
import { checkRateLimit } from "@/lib/rateLimit";

// Compared against when the username doesn't exist, so a miss takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);
const TOO_MANY = () => NextResponse.json({ message: "Too many attempts. Try again in a minute." }, { status: 429 });

export async function POST(req: NextRequest) {
  if (!checkRateLimit(`login:${clientIp(req)}`, 10, 60_000)) return TOO_MANY();
  const { username, password } = await req.json().catch(() => ({}));
  if (!username || !password) return NextResponse.json({ message: "Missing credentials" }, { status: 400 });
  const name = String(username).trim().toLowerCase();
  // A per-account limit too, so guessing one password from many addresses still gets slowed down.
  if (!checkRateLimit(`login-user:${name}`, 30, 10 * 60_000)) return TOO_MANY();
  const user = db.prepare("SELECT id, username, password, disabled, token_version FROM users WHERE username = ?")
    .get(name) as { id: number; username: string; password: string; disabled: number; token_version: number } | undefined;
  const matches = bcrypt.compareSync(String(password), user?.password ?? DUMMY_HASH);
  if (!user || user.disabled || !matches) {
    return NextResponse.json({ message: "Invalid username or password" }, { status: 401 });
  }
  const session = await getSession();
  session.user = { id: user.id, username: user.username, v: user.token_version };
  await session.save();
  return NextResponse.json({ ok: true });
}
