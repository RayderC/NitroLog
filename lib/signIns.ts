// Sign-in history and "sign out everywhere".
import type { NextRequest } from "next/server";
import { clientIp } from "./api";
import { db } from "./db";
import { describeAgent } from "./updateCore";

export type SignIn = { at: string; ip: string | null; device: string; ok: boolean };

/** Kept to the last 50 per person. Failed tries are recorded too, so you can spot someone guessing. */
export function recordSignIn(userId: number, req: NextRequest, ok = true) {
  const ip = clientIp(req);
  db.prepare("INSERT INTO sign_ins (user_id, ip, device, ok) VALUES (?, ?, ?, ?)")
    .run(userId, ip === "local" ? null : ip, describeAgent(req.headers.get("user-agent")), ok ? 1 : 0);
  db.prepare("DELETE FROM sign_ins WHERE user_id = ? AND id NOT IN (SELECT id FROM sign_ins WHERE user_id = ? ORDER BY id DESC LIMIT 50)").run(userId, userId);
}

export function listSignIns(userId: number, limit = 20): SignIn[] {
  return (db.prepare("SELECT at, ip, device, ok FROM sign_ins WHERE user_id = ? ORDER BY id DESC LIMIT ?").all(userId, limit) as { at: string; ip: string | null; device: string; ok: number }[])
    .map(r => ({ at: r.at, ip: r.ip, device: r.device, ok: !!r.ok }));
}

/** Ends every session this person has. Returns the new version, so the caller can keep its own session. */
export function signOutEverywhere(userId: number): number {
  db.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?").run(userId);
  return (db.prepare("SELECT token_version v FROM users WHERE id = ?").get(userId) as { v: number }).v;
}
