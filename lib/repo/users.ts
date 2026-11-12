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

function checkUsername(username: unknown, exceptId?: number): string {
  const name = String(username ?? "").trim().toLowerCase();
  if (name.length < 2 || name.length > 40 || !/^[a-z0-9_.-]+$/.test(name)) throw bad("Username must be 2-40 letters, numbers, dots, dashes or underscores");
  const taken = db.prepare("SELECT id FROM users WHERE username = ?").get(name) as { id: number } | undefined;
  if (taken && taken.id !== exceptId) throw bad("That username is taken");
  return name;
}

export function createUser(username: unknown, password: unknown, isAdmin: unknown, units?: { distance?: unknown; volume?: unknown }) {
  const name = checkUsername(username);
  const pw = checkPassword(password);
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

export function updateUser(actorId: number, id: number, p: { username?: unknown; password?: unknown; disabled?: unknown; isAdmin?: unknown }) {
  const u = target(id);
  db.transaction(() => {
    // Signing in uses the new name straight away. Sessions are tied to the account, not the name, so nobody is signed out.
    if (p.username !== undefined) db.prepare("UPDATE users SET username = ? WHERE id = ?").run(checkUsername(p.username, id), id);
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

/** Who would take over a vehicle by default: someone it's shared with, editors first. */
function heirOf(vehicleId: number, exceptUserId: number) {
  return db.prepare(`SELECT m.user_id AS id, u.username FROM vehicle_members m JOIN users u ON u.id = m.user_id
    WHERE m.vehicle_id = ? AND m.user_id != ? AND u.disabled = 0
    ORDER BY CASE m.role WHEN 'editor' THEN 0 ELSE 1 END, m.user_id LIMIT 1`).get(vehicleId, exceptUserId) as { id: number; username: string } | undefined;
}

export type DeletePlan = { vehicles: { id: number; name: string; heir: { id: number; username: string } | null }[] };

/** What deleting this account would do to its vehicles, so the admin can choose before anything happens. */
export function deletePlan(id: number): DeletePlan {
  target(id);
  const owned = db.prepare("SELECT id, name FROM vehicles WHERE owner_id = ? ORDER BY name COLLATE NOCASE").all(id) as { id: number; name: string }[];
  return { vehicles: owned.map(v => ({ ...v, heir: heirOf(v.id, id) ?? null })) };
}

/** Moves a vehicle to a new owner. The new owner stops being a member, since they now own it. */
export function transferVehicle(vehicleId: number, toUserId: number) {
  const to = db.prepare("SELECT id, disabled FROM users WHERE id = ?").get(toUserId) as { id: number; disabled: number } | undefined;
  if (!to) throw bad("That person doesn't exist");
  if (!db.prepare("SELECT 1 FROM vehicles WHERE id = ?").get(vehicleId)) throw notFound("Vehicle not found");
  db.prepare("UPDATE vehicles SET owner_id = ? WHERE id = ?").run(toUserId, vehicleId);
  db.prepare("DELETE FROM vehicle_members WHERE vehicle_id = ? AND user_id = ?").run(vehicleId, toUserId);
}

/**
 * Removes the account. For each vehicle it owns, `choices` says who gets it (a user id) or "delete". Without a
 * choice, a vehicle passes to someone it's shared with; a vehicle nobody else can see needs a choice first.
 */
export function deleteUser(actorId: number, id: number, choices: Record<string, unknown> = {}) {
  const u = target(id);
  if (id === actorId) throw new HttpError(400, "You can't delete your own account");
  if (u.is_admin) assertOtherAdmin(id);
  const files = db.transaction(() => {
    const owned = db.prepare("SELECT id, name FROM vehicles WHERE owner_id = ?").all(id) as { id: number; name: string }[];
    const doomed: number[] = [];
    for (const v of owned) {
      const choice = choices[String(v.id)];
      if (choice === "delete") { doomed.push(v.id); continue; }
      const to = choice !== undefined && choice !== null && choice !== "" ? Number(choice) : heirOf(v.id, id)?.id;
      if (to === undefined) throw bad(`Choose who gets the ${v.name}, or to delete it.`);
      if (!Number.isInteger(to) || to === id) throw bad(`Choose someone else to get the ${v.name}.`);
      transferVehicle(v.id, to);
    }
    const names = storedNamesForVehicles(doomed);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    return names;
  })();
  // Files go last, so a failed transaction can't leave records pointing at deleted files.
  files.forEach(deleteFile);
}

export type AdminVehicle = {
  id: number; name: string; year: number | null; make: string | null; model: string | null;
  ownerId: number; owner: string; sharedWith: string[]; archived: boolean; sold: boolean; records: number; lastActivity: string | null;
};

/** Every vehicle on the server, for the Admin page. Names and counts only: their records stay private to the people on them. */
export function listAllVehicles(): AdminVehicle[] {
  const rows = db.prepare(`SELECT v.id, v.name, v.year, v.make, v.model, v.owner_id, u.username AS owner, v.archived, v.sold_on,
      (SELECT COUNT(*) FROM service_records s WHERE s.vehicle_id = v.id) + (SELECT COUNT(*) FROM fuel_logs f WHERE f.vehicle_id = v.id) AS records,
      (SELECT MAX(d) FROM (SELECT MAX(date) d FROM service_records WHERE vehicle_id = v.id UNION ALL SELECT MAX(date) FROM fuel_logs WHERE vehicle_id = v.id)) AS last,
      (SELECT GROUP_CONCAT(mu.username, ', ') FROM vehicle_members m JOIN users mu ON mu.id = m.user_id WHERE m.vehicle_id = v.id) AS shared
    FROM vehicles v JOIN users u ON u.id = v.owner_id ORDER BY u.username, v.name COLLATE NOCASE`).all() as {
      id: number; name: string; year: number | null; make: string | null; model: string | null; owner_id: number; owner: string;
      archived: number; sold_on: string | null; records: number; last: string | null; shared: string | null;
    }[];
  return rows.map(r => ({
    id: r.id, name: r.name, year: r.year, make: r.make, model: r.model, ownerId: r.owner_id, owner: r.owner,
    sharedWith: r.shared ? r.shared.split(", ") : [], archived: !!r.archived, sold: !!r.sold_on, records: r.records, lastActivity: r.last,
  }));
}

/** Deletes a vehicle and everything on it, for the Admin page. */
export function adminDeleteVehicle(vehicleId: number) {
  if (!db.prepare("SELECT 1 FROM vehicles WHERE id = ?").get(vehicleId)) throw notFound("Vehicle not found");
  const files = db.transaction(() => {
    const names = storedNamesForVehicles([vehicleId]);
    db.prepare("DELETE FROM vehicles WHERE id = ?").run(vehicleId);
    return names;
  })();
  files.forEach(deleteFile);
}
