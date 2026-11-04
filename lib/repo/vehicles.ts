import { db } from "../db";
import { bad, day, HttpError, int, notFound, numOrNull, requiredText, text } from "../api";
import { deleteFile } from "../files";
import { KINDS, templateFor, type VehicleKind } from "../templates";
import type { Member, ReadingEntry, Role, Vehicle } from "../types";
import type { MeterType } from "../units";

type Row = {
  id: number; owner_id: number; owner_name: string; name: string; kind: VehicleKind; year: number | null;
  make: string | null; model: string | null; trim: string | null; engine: string | null; vin: string | null;
  plate: string | null; meter_type: MeterType; currency: string; notes: string | null; archived: number;
  role: Role; members: number;
};

const SELECT = `SELECT v.*, u.username AS owner_name,
    CASE WHEN v.owner_id = @u THEN 'owner' ELSE m.role END AS role,
    (SELECT COUNT(*) FROM vehicle_members x WHERE x.vehicle_id = v.id) AS members
  FROM vehicles v
  JOIN users u ON u.id = v.owner_id
  LEFT JOIN vehicle_members m ON m.vehicle_id = v.id AND m.user_id = @u
  WHERE (v.owner_id = @u OR m.user_id IS NOT NULL)`;

export function currentReading(vehicleId: number): number | null {
  const r = db.prepare(`SELECT MAX(r) AS r FROM (
      SELECT reading AS r FROM odometer_readings WHERE vehicle_id = @v
      UNION ALL SELECT reading FROM service_records WHERE vehicle_id = @v
      UNION ALL SELECT reading FROM fuel_logs WHERE vehicle_id = @v
    )`).get({ v: vehicleId }) as { r: number | null };
  return r.r;
}

function toVehicle(r: Row): Vehicle {
  return {
    id: r.id, name: r.name, kind: r.kind, year: r.year, make: r.make, model: r.model, trim: r.trim, engine: r.engine,
    vin: r.vin, plate: r.plate, meterType: r.meter_type, currency: r.currency, notes: r.notes, archived: !!r.archived,
    reading: currentReading(r.id), role: r.role, ownerName: r.owner_name, shared: r.members > 0,
  };
}

export function listVehicles(userId: number): Vehicle[] {
  const rows = db.prepare(`${SELECT} ORDER BY v.archived, v.name COLLATE NOCASE`).all({ u: userId }) as Row[];
  return rows.map(toVehicle);
}

/**
 * The only way in to a vehicle's data. No access is a 404, so ids can't be probed.
 * Admins get no special case here: admin manages accounts, not other people's vehicles.
 */
export function requireVehicle(userId: number, vehicleId: number, need: "view" | "edit" | "owner" = "view"): Vehicle {
  const row = db.prepare(`${SELECT} AND v.id = @v`).get({ u: userId, v: vehicleId }) as Row | undefined;
  if (!row) throw notFound("Vehicle not found");
  if (need === "owner" && row.role !== "owner") throw new HttpError(403, "Only the owner can do that");
  if (need === "edit" && row.role === "viewer") throw new HttpError(403, "You have view-only access to this vehicle");
  return toVehicle(row);
}

function kind(v: unknown): VehicleKind {
  if (!KINDS.some(k => k.value === v)) throw bad("Invalid vehicle type");
  return v as VehicleKind;
}

function currency(v: unknown): string {
  const c = String(v ?? "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw bad("Currency must be a 3-letter code like USD");
  return c;
}

function details(b: any) {
  const year = numOrNull(b.year, "year", 2200);
  if (year !== null && (!Number.isInteger(year) || year < 1885)) throw bad("Invalid year");
  const parts = {
    year,
    make: text(b.make, 80),
    model: text(b.model, 80),
    trim: text(b.trim, 80),
    engine: text(b.engine, 120),
    vin: text(b.vin, 17)?.toUpperCase() ?? null,
    plate: text(b.plate, 20),
    notes: text(b.notes, 4000),
  };
  const fallback = [parts.year, parts.make, parts.model].filter(Boolean).join(" ");
  return { ...parts, name: text(b.name, 80) ?? (fallback || null) };
}

/** `templates` is the names of starter items to add. The server looks up their intervals itself. */
export function createVehicle(userId: number, distanceUnit: "mi" | "km", b: any): number {
  const k = kind(b.kind);
  const d = details(b);
  if (!d.name) throw bad("Give the vehicle a name, or a year, make or model");
  const meter: MeterType = b.meterType === "hours" ? "hours" : "distance";
  const reading = numOrNull(b.reading, "reading");
  const today = day(b.today, "today");
  const wanted: string[] = Array.isArray(b.templates) ? b.templates : [];

  return db.transaction(() => {
    const info = db.prepare(`INSERT INTO vehicles (owner_id, name, kind, year, make, model, trim, engine, vin, plate, meter_type, currency, notes)
      VALUES (@owner, @name, @kind, @year, @make, @model, @trim, @engine, @vin, @plate, @meter, @currency, @notes)`)
      .run({ ...d, owner: userId, kind: k, meter, currency: currency(b.currency) });
    const id = Number(info.lastInsertRowid);
    if (reading !== null) {
      db.prepare("INSERT INTO odometer_readings (vehicle_id, reading, date, created_by) VALUES (?, ?, ?, ?)").run(id, reading, today, userId);
    }
    const add = db.prepare("INSERT INTO schedule_items (vehicle_id, name, interval_reading, interval_months, base_date, base_reading) VALUES (?, ?, ?, ?, ?, ?)");
    for (const t of templateFor(k, meter)) {
      if (!wanted.includes(t.name)) continue;
      const interval = meter === "hours"
        ? t.hours ?? null
        : t.mi !== undefined ? (distanceUnit === "mi" ? t.mi * 1609.344 : t.km! * 1000) : null;
      add.run(id, t.name, interval, t.months ?? null, today, reading);
    }
    return id;
  })();
}

export function updateVehicle(userId: number, id: number, b: any) {
  const current = requireVehicle(userId, id, "edit");
  const d = details({ ...current, ...b });
  if (!d.name) throw bad("Vehicle name is required");
  // meter_type is fixed at creation: stored readings would otherwise change meaning.
  db.prepare(`UPDATE vehicles SET name=@name, kind=@kind, year=@year, make=@make, model=@model, trim=@trim, engine=@engine,
      vin=@vin, plate=@plate, currency=@currency, notes=@notes, archived=@archived WHERE id=@id`).run({
    ...d, id,
    kind: kind(b.kind ?? current.kind),
    currency: currency(b.currency ?? current.currency),
    archived: (b.archived ?? current.archived) ? 1 : 0,
  });
}

export function deleteVehicle(userId: number, id: number) {
  requireVehicle(userId, id, "owner");
  const files = storedNamesForVehicles([id]);
  db.prepare("DELETE FROM vehicles WHERE id = ?").run(id);
  files.forEach(deleteFile);
}

/**
 * Lives here, not in attachments.ts, because that module imports this one. The database cascade can't
 * remove files, so callers fetch these names before deleting vehicles.
 */
export function storedNamesForVehicles(vehicleIds: number[]): string[] {
  const stmt = db.prepare("SELECT stored_name FROM attachments WHERE vehicle_id = ?");
  return vehicleIds.flatMap(id => (stmt.all(id) as { stored_name: string }[]).map(r => r.stored_name));
}

// ── Readings ──

export function listReadings(vehicleId: number, limit = 50): ReadingEntry[] {
  const rows = db.prepare(`SELECT * FROM (
      SELECT r.id, 'manual' AS source, r.date, r.reading, u.username AS who FROM odometer_readings r LEFT JOIN users u ON u.id = r.created_by WHERE r.vehicle_id = @v
      UNION ALL SELECT s.id, 'service', s.date, s.reading, u.username FROM service_records s LEFT JOIN users u ON u.id = s.created_by WHERE s.vehicle_id = @v AND s.reading IS NOT NULL
      UNION ALL SELECT f.id, 'fuel', f.date, f.reading, u.username FROM fuel_logs f LEFT JOIN users u ON u.id = f.created_by WHERE f.vehicle_id = @v AND f.reading IS NOT NULL
    ) ORDER BY date DESC, reading DESC LIMIT @limit`).all({ v: vehicleId, limit });
  return (rows as (Omit<ReadingEntry, "by"> & { who: string | null })[]).map(({ who, ...r }) => ({ ...r, by: who }));
}

export function addReading(userId: number, vehicleId: number, b: any) {
  const v = requireVehicle(userId, vehicleId, "edit");
  const reading = numOrNull(b.reading, "reading");
  if (reading === null) throw bad("Enter a reading");
  // The current reading is the highest ever logged, so a lower one would have no effect. Say why rather than ignore it.
  if (v.reading !== null && reading < v.reading) {
    throw bad("That's lower than the current reading. If the current one is a typo, fix or delete that entry under Overview → Readings.");
  }
  db.prepare("INSERT INTO odometer_readings (vehicle_id, reading, date, created_by) VALUES (?, ?, ?, ?)").run(vehicleId, reading, day(b.date), userId);
}

export function deleteReading(userId: number, id: number) {
  const r = db.prepare("SELECT vehicle_id FROM odometer_readings WHERE id = ?").get(id) as { vehicle_id: number } | undefined;
  if (!r) throw notFound("Reading not found");
  requireVehicle(userId, r.vehicle_id, "edit");
  db.prepare("DELETE FROM odometer_readings WHERE id = ?").run(id);
}

// ── Sharing ──

export function listMembers(vehicleId: number): Member[] {
  const rows = db.prepare(`SELECT m.user_id, u.username, m.role FROM vehicle_members m JOIN users u ON u.id = m.user_id
    WHERE m.vehicle_id = ? ORDER BY u.username`).all(vehicleId) as { user_id: number; username: string; role: Member["role"] }[];
  return rows.map(r => ({ userId: r.user_id, username: r.username, role: r.role }));
}

function memberRole(v: unknown): Member["role"] {
  if (v !== "editor" && v !== "viewer") throw bad("Role must be editor or viewer");
  return v;
}

export function addMember(ownerId: number, vehicleId: number, b: any) {
  requireVehicle(ownerId, vehicleId, "owner");
  const name = requiredText(b.username, "Username", 80).toLowerCase();
  const u = db.prepare("SELECT id FROM users WHERE username = ? AND disabled = 0").get(name) as { id: number } | undefined;
  if (!u) throw notFound(`No user named ${name}`);
  if (u.id === ownerId) throw bad("You already own this vehicle");
  db.prepare(`INSERT INTO vehicle_members (vehicle_id, user_id, role) VALUES (?, ?, ?)
    ON CONFLICT (vehicle_id, user_id) DO UPDATE SET role = excluded.role`).run(vehicleId, u.id, memberRole(b.role));
}

export function setMemberRole(ownerId: number, vehicleId: number, userId: unknown, role: unknown) {
  requireVehicle(ownerId, vehicleId, "owner");
  const r = db.prepare("UPDATE vehicle_members SET role = ? WHERE vehicle_id = ? AND user_id = ?").run(memberRole(role), vehicleId, int(userId));
  if (!r.changes) throw notFound("Member not found");
}

/** Owners can remove anyone, and members can remove themselves. */
export function removeMember(actorId: number, vehicleId: number, userId: number) {
  requireVehicle(actorId, vehicleId, actorId === userId ? "view" : "owner");
  db.prepare("DELETE FROM vehicle_members WHERE vehicle_id = ? AND user_id = ?").run(vehicleId, userId);
}
