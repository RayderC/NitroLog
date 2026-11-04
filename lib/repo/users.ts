import bcrypt from "bcryptjs";
import { db } from "../db";
import { bad, HttpError, notFound } from "../api";
import { deleteFile } from "../files";
import { storedNamesForVehicles } from "./vehicles";

export type AdminUser = {
  id: number; username: string; isAdmin: boolean; disabled: boolean; createdAt: string; vehicles: number;
};

export function listUsers(): AdminUser[] {
  const rows = db.prepare(`SELECT u.id, u.username, u.is_admin, u.disabled, u.created_at,
      (SELECT COUNT(*) FROM vehicles v WHERE v.owner_id = u.id) n
    FROM users u ORDER BY u.id`).all() as { id: number; username: string; is_admin: number; disabled: number; created_at: string; n: number }[];
  return rows.map(r => ({ id: r.id, username: r.username, isAdmin: !!r.is_admin, disabled: !!r.disabled, createdAt: r.created_at, vehicles: r.n }));
}

function checkPassword(p: unknown): string {
  if (typeof p !== "string" || p.length < 8) throw bad("Password must be at least 8 characters");
  if (p.length > 72) throw bad("Password must be 72 characters or fewer"); // bcrypt ignores anything past 72 bytes
  return p;
}

export function createUser(username: unknown, password: unknown, isAdmin: unknown, units?: { distance?: unknown; volume?: unknown }) {
  const name = String(username ?? "").trim().toLowerCase();
  if (name.length < 2 || name.length > 40 || !/^[a-z0-9_.-]+$/.test(name)) throw bad("Username must be 2-40 letters or numbers");
  const pw = checkPassword(password);
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(name)) throw bad("That username is taken");
  const info = db.prepare("INSERT INTO users (username, password, is_admin, distance_unit, volume_unit) VALUES (?, ?, ?, ?, ?)")
    .run(name, bcrypt.hashSync(pw, 12), isAdmin ? 1 : 0, units?.distance === "km" ? "km" : "mi", units?.volume === "L" ? "L" : "gal");
  return Number(info.lastInsertRowid);
}

export function setPassword(id: number, password: unknown) {
  // Bumping the version signs out every existing session for this user.
  db.prepare("UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?").run(bcrypt.hashSync(checkPassword(password), 12), id);
}

function target(id: number) {
  const u = db.prepare("SELECT id, is_admin, disabled FROM users WHERE id = ?").get(id) as { id: number; is_admin: number; disabled: number } | undefined;
  if (!u) throw notFound("User not found");
  return u;
}

/** Stop an action that would leave nobody able to administer the server. */
function assertOtherAdmin(id: number) {
  const others = (db.prepare("SELECT COUNT(*) c FROM users WHERE is_admin = 1 AND disabled = 0 AND id != ?").get(id) as { c: number }).c;
  if (!others) throw bad("There must always be at least one active admin");
}

export function updateUser(actorId: number, id: number, p: { password?: unknown; disabled?: unknown; isAdmin?: unknown }) {
  const u = target(id);
  db.transaction(() => {
    if (p.password !== undefined) setPassword(id, p.password);
    if (p.disabled !== undefined) {
      if (p.disabled) {
        if (id === actorId) throw new HttpError(400, "You can't disable your own account");
        if (u.is_admin) assertOtherAdmin(id);
      }
      db.prepare("UPDATE users SET disabled = ? WHERE id = ?").run(p.disabled ? 1 : 0, id);
    }
    if (p.isAdmin !== undefined) {
      if (!p.isAdmin) {
        if (id === actorId) throw new HttpError(400, "You can't remove your own admin access");
        assertOtherAdmin(id);
      }
      db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(p.isAdmin ? 1 : 0, id);
    }
  })();
}

/**
 * Removes the account. Vehicles shared with someone pass to a member (editors first) so other people
 * don't lose them. Vehicles nobody else can see are deleted with the account.
 */
export function deleteUser(actorId: number, id: number) {
  const u = target(id);
  if (id === actorId) throw new HttpError(400, "You can't delete your own account");
  if (u.is_admin) assertOtherAdmin(id);
  const files = db.transaction(() => {
    const owned = db.prepare("SELECT id FROM vehicles WHERE owner_id = ?").all(id) as { id: number }[];
    const doomed: number[] = [];
    for (const v of owned) {
      const next = db.prepare(`SELECT user_id FROM vehicle_members WHERE vehicle_id = ?
        ORDER BY CASE role WHEN 'editor' THEN 0 ELSE 1 END, user_id LIMIT 1`).get(v.id) as { user_id: number } | undefined;
      if (!next) { doomed.push(v.id); continue; }
      db.prepare("UPDATE vehicles SET owner_id = ? WHERE id = ?").run(next.user_id, v.id);
      db.prepare("DELETE FROM vehicle_members WHERE vehicle_id = ? AND user_id = ?").run(v.id, next.user_id);
    }
    const names = storedNamesForVehicles(doomed);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    return names;
  })();
  // Files go last, so a failed transaction can't leave records pointing at deleted files.
  files.forEach(deleteFile);
}
