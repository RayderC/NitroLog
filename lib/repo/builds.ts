import { db } from "../db";
import { bad, cents, day, int, notFound, numOrNull, requiredText, text } from "../api";
import type { BuildData } from "../types";
import { requireVehicle } from "./vehicles";

export type BuildType = "stage" | "task" | "wish" | "log";

export function buildType(v: string): BuildType {
  if (v === "stage" || v === "task" || v === "wish" || v === "log") return v;
  throw notFound();
}

export function getBuild(vehicleId: number): BuildData {
  const stages = db.prepare("SELECT id, name, notes FROM build_stages WHERE vehicle_id = ? ORDER BY sort, id").all(vehicleId) as { id: number; name: string; notes: string | null }[];
  const tasks = db.prepare(`SELECT t.id, t.stage_id, t.title, t.done, t.hours FROM build_tasks t JOIN build_stages s ON s.id = t.stage_id
    WHERE s.vehicle_id = ? ORDER BY t.id`).all(vehicleId) as { id: number; stage_id: number; title: string; done: number; hours: number | null }[];
  const wishlist = db.prepare("SELECT * FROM wishlist_items WHERE vehicle_id = ? ORDER BY status = 'planned' DESC, id").all(vehicleId) as {
    id: number; stage_id: number | null; name: string; url: string | null; planned_cents: number; actual_cents: number | null; status: "planned" | "bought" | "installed"; notes: string | null;
  }[];
  const log = db.prepare(`SELECT l.id, l.date, l.title, l.body, l.service_id, l.power_before, l.power_after, l.power_unit, u.username AS who
    FROM build_log l LEFT JOIN users u ON u.id = l.created_by
    WHERE l.vehicle_id = ? ORDER BY l.date DESC, l.id DESC`).all(vehicleId) as {
      id: number; date: string; title: string; body: string | null; who: string | null; service_id: number | null;
      power_before: number | null; power_after: number | null; power_unit: "whp" | "hp" | null;
    }[];
  const partsOf = db.prepare("SELECT name, brand FROM service_items WHERE service_id = ? ORDER BY id");
  // Power: the first "before" on the build's timeline, and the latest "after".
  const withPower = [...log].reverse().filter(l => l.power_before !== null || l.power_after !== null);
  const powerStart = withPower.find(l => l.power_before !== null)?.power_before ?? null;
  const latest = [...withPower].reverse().find(l => l.power_after !== null);
  const upgrade = db.prepare(`SELECT COALESCE(SUM(s.labor_cost_cents + COALESCE((SELECT SUM(i.cost_cents) FROM service_items i WHERE i.service_id = s.id), 0)), 0) AS cents,
      COALESCE(SUM(s.labor_hours), 0) AS hours
    FROM service_records s WHERE s.vehicle_id = ? AND s.category = 'upgrade'`).get(vehicleId) as { cents: number; hours: number };

  const wishSpent = wishlist.filter(w => w.status !== "planned").reduce((sum, w) => sum + (w.actual_cents ?? w.planned_cents), 0);
  return {
    stages: stages.map(s => ({
      ...s,
      tasks: tasks.filter(t => t.stage_id === s.id).map(t => ({ id: t.id, title: t.title, done: !!t.done, hours: t.hours })),
    })),
    wishlist: wishlist.map(w => ({
      id: w.id, stageId: w.stage_id, name: w.name, url: w.url, plannedCents: w.planned_cents, actualCents: w.actual_cents, status: w.status, notes: w.notes,
    })),
    log: log.map(l => ({
      id: l.id, date: l.date, title: l.title, body: l.body, by: l.who, serviceId: l.service_id,
      parts: l.service_id ? (partsOf.all(l.service_id) as { name: string; brand: string | null }[]).map(p => [p.brand, p.name].filter(Boolean).join(" ")) : [],
      powerBefore: l.power_before, powerAfter: l.power_after, powerUnit: l.power_unit,
    })),
    totals: {
      plannedCents: wishlist.reduce((sum, w) => sum + w.planned_cents, 0),
      wishlistSpentCents: wishSpent,
      upgradeCents: upgrade.cents,
      spentCents: wishSpent + upgrade.cents,
      hours: upgrade.hours + tasks.reduce((sum, t) => sum + (t.hours ?? 0), 0),
      tasksDone: tasks.filter(t => t.done).length,
      tasksTotal: tasks.length,
      powerStart, powerNow: latest?.power_after ?? null, powerUnit: latest?.power_unit ?? withPower[0]?.power_unit ?? null,
    },
  };
}

function stageOn(v: unknown, vehicleId: number): number {
  const id = int(v, "stage");
  if (!db.prepare("SELECT 1 FROM build_stages WHERE id = ? AND vehicle_id = ?").get(id, vehicleId)) throw bad("That stage isn't on this vehicle");
  return id;
}

/** Stored links render as hrefs, so a javascript: URL here would run as whoever clicked it. */
function link(v: unknown): string | null {
  const t = text(v, 1000);
  if (!t) return null;
  let u: URL;
  try { u = new URL(t); } catch { throw bad("Links need to start with http:// or https://"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw bad("Links need to start with http:// or https://");
  return u.toString();
}

function parseWish(b: any, vehicleId: number) {
  if (!["planned", "bought", "installed"].includes(b.status)) throw bad("Invalid status");
  return {
    stage_id: b.stageId === null || b.stageId === undefined || b.stageId === "" ? null : stageOn(b.stageId, vehicleId),
    name: requiredText(b.name, "Name", 160),
    url: link(b.url),
    planned_cents: cents(b.plannedCents),
    actual_cents: b.actualCents === null || b.actualCents === undefined || b.actualCents === "" ? null : cents(b.actualCents),
    status: b.status as string,
    notes: text(b.notes, 2000),
  };
}

const parseLog = (b: any) => ({
  date: day(b.date), title: requiredText(b.title, "Title", 160), body: text(b.body, 20000),
  power_before: numOrNull(b.powerBefore, "power before", 10_000), power_after: numOrNull(b.powerAfter, "power after", 10_000),
  power_unit: b.powerUnit === "hp" ? "hp" : (b.powerBefore || b.powerAfter) ? "whp" : null,
});
const parseStage = (b: any) => ({ name: requiredText(b.name, "Name", 120), notes: text(b.notes, 2000) });
const parseTask = (b: any) => ({ title: requiredText(b.title, "Task", 200), done: b.done ? 1 : 0, hours: numOrNull(b.hours, "hours", 100_000) });

export function createBuildItem(userId: number, vehicleId: number, type: BuildType, b: any): number {
  requireVehicle(userId, vehicleId, "edit");
  let info;
  if (type === "stage") {
    const next = (db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 n FROM build_stages WHERE vehicle_id = ?").get(vehicleId) as { n: number }).n;
    info = db.prepare("INSERT INTO build_stages (vehicle_id, name, notes, sort) VALUES (@vehicle_id, @name, @notes, @sort)").run({ ...parseStage(b), vehicle_id: vehicleId, sort: next });
  } else if (type === "task") {
    info = db.prepare("INSERT INTO build_tasks (stage_id, title, done, hours) VALUES (@stage_id, @title, @done, @hours)").run({ ...parseTask(b), stage_id: stageOn(b.stageId, vehicleId) });
  } else if (type === "wish") {
    info = db.prepare(`INSERT INTO wishlist_items (vehicle_id, stage_id, name, url, planned_cents, actual_cents, status, notes)
      VALUES (@vehicle_id, @stage_id, @name, @url, @planned_cents, @actual_cents, @status, @notes)`).run({ ...parseWish(b, vehicleId), vehicle_id: vehicleId });
  } else {
    info = db.prepare(`INSERT INTO build_log (vehicle_id, date, title, body, created_by, power_before, power_after, power_unit)
      VALUES (@vehicle_id, @date, @title, @body, @created_by, @power_before, @power_after, @power_unit)`).run({ ...parseLog(b), vehicle_id: vehicleId, created_by: userId });
  }
  return Number(info.lastInsertRowid);
}

function vehicleOf(type: BuildType, id: number): number {
  const sql = {
    stage: "SELECT vehicle_id FROM build_stages WHERE id = ?",
    task: "SELECT s.vehicle_id FROM build_tasks t JOIN build_stages s ON s.id = t.stage_id WHERE t.id = ?",
    wish: "SELECT vehicle_id FROM wishlist_items WHERE id = ?",
    log: "SELECT vehicle_id FROM build_log WHERE id = ?",
  }[type];
  const r = db.prepare(sql).get(id) as { vehicle_id: number } | undefined;
  if (!r) throw notFound("Item not found");
  return r.vehicle_id;
}

export function updateBuildItem(userId: number, type: BuildType, id: number, b: any) {
  const vehicleId = vehicleOf(type, id);
  requireVehicle(userId, vehicleId, "edit");
  if (type === "stage") db.prepare("UPDATE build_stages SET name=@name, notes=@notes WHERE id=@id").run({ ...parseStage(b), id });
  else if (type === "task") db.prepare("UPDATE build_tasks SET title=@title, done=@done, hours=@hours WHERE id=@id").run({ ...parseTask(b), id });
  else if (type === "wish") {
    db.prepare(`UPDATE wishlist_items SET stage_id=@stage_id, name=@name, url=@url, planned_cents=@planned_cents, actual_cents=@actual_cents,
      status=@status, notes=@notes WHERE id=@id`).run({ ...parseWish(b, vehicleId), id });
  } else db.prepare("UPDATE build_log SET date=@date, title=@title, body=@body, power_before=@power_before, power_after=@power_after, power_unit=@power_unit WHERE id=@id").run({ ...parseLog(b), id });
}

export function deleteBuildItem(userId: number, type: BuildType, id: number) {
  requireVehicle(userId, vehicleOf(type, id), "edit");
  const table = { stage: "build_stages", task: "build_tasks", wish: "wishlist_items", log: "build_log" }[type];
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
}
