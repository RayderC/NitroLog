import { db } from "../db";
import { bad, cents, day, int, notFound, numOrNull, requiredText, text, webLink } from "../api";
import { SERVICE_CATEGORIES, type ServiceBuild, type ServiceDetail, type ServiceItem, type ServiceSummary } from "../types";
import { assertInventoryUsable } from "./inventory";
import { requireVehicle } from "./vehicles";

type Row = {
  id: number; vehicle_id: number; date: string; reading: number | null; title: string; category: string;
  labor_hours: number | null; labor_cost_cents: number; notes: string | null; parts_cents: number; logged_by: string | null;
};

const SELECT = `SELECT s.*, u.username AS logged_by,
    (SELECT COALESCE(SUM(i.cost_cents), 0) FROM service_items i WHERE i.service_id = s.id) AS parts_cents
  FROM service_records s LEFT JOIN users u ON u.id = s.created_by`;

const toSummary = (r: Row): ServiceSummary => ({
  id: r.id, vehicleId: r.vehicle_id, date: r.date, reading: r.reading, title: r.title, category: r.category,
  laborHours: r.labor_hours, laborCostCents: r.labor_cost_cents, notes: r.notes,
  totalCents: r.parts_cents + r.labor_cost_cents, loggedBy: r.logged_by,
});

export function listService(vehicleId: number): ServiceSummary[] {
  const rows = db.prepare(`${SELECT} WHERE s.vehicle_id = ? ORDER BY s.date DESC, s.id DESC`).all(vehicleId) as Row[];
  return rows.map(toSummary);
}

function vehicleOf(id: number): number {
  const r = db.prepare("SELECT vehicle_id FROM service_records WHERE id = ?").get(id) as { vehicle_id: number } | undefined;
  if (!r) throw notFound("Service record not found");
  return r.vehicle_id;
}

export function getService(userId: number, id: number): ServiceDetail {
  requireVehicle(userId, vehicleOf(id), "view");
  const row = db.prepare(`${SELECT} WHERE s.id = ?`).get(id) as Row;
  const items = db.prepare("SELECT kind, name, part_number, brand, quantity, unit, cost_cents, inventory_id, url FROM service_items WHERE service_id = ? ORDER BY id").all(id) as {
    kind: ServiceItem["kind"]; name: string; part_number: string | null; brand: string | null; quantity: number | null; unit: string | null; cost_cents: number; inventory_id: number | null; url: string | null;
  }[];
  const tasks = db.prepare("SELECT schedule_id FROM service_tasks WHERE service_id = ?").all(id) as { schedule_id: number }[];
  const log = db.prepare("SELECT body, power_before, power_after, power_unit FROM build_log WHERE service_id = ? ORDER BY id LIMIT 1").get(id) as
    { body: string | null; power_before: number | null; power_after: number | null; power_unit: "whp" | "hp" | null } | undefined;
  return {
    ...toSummary(row),
    items: items.map(i => ({ kind: i.kind, name: i.name, partNumber: i.part_number, brand: i.brand, quantity: i.quantity, unit: i.unit, costCents: i.cost_cents, inventoryId: i.inventory_id, url: i.url })),
    scheduleIds: tasks.map(t => t.schedule_id),
    build: log ? { add: true, powerBefore: log.power_before, powerAfter: log.power_after, powerUnit: log.power_unit, note: log.body } : null,
  };
}

/** What the form says about the build log. Undefined means an older client that doesn't know about it, so leave it alone. */
function parseBuild(b: any): ServiceBuild | null | undefined {
  if (b === undefined) return undefined;
  if (!b || !b.add) return null;
  const unit = b.powerUnit === "hp" ? "hp" : "whp";
  return {
    add: true, powerBefore: numOrNull(b.powerBefore, "power before", 10_000), powerAfter: numOrNull(b.powerAfter, "power after", 10_000),
    powerUnit: unit, note: text(b.note, 20000),
  };
}

/**
 * Keeps an Upgrade record's build log entry in step with it: made or updated while it's an upgrade with
 * "add to the build log" ticked, and removed otherwise. Photos on a removed entry stay under Documents.
 */
function syncBuildLog(userId: number, serviceId: number, vehicleId: number, record: { date: string; title: string; category: string }, build: ServiceBuild | null | undefined) {
  if (build === undefined) return;
  const existing = db.prepare("SELECT id FROM build_log WHERE service_id = ?").get(serviceId) as { id: number } | undefined;
  if (!build || record.category !== "upgrade") {
    if (existing) db.prepare("DELETE FROM build_log WHERE id = ?").run(existing.id);
    return;
  }
  const row = { date: record.date, title: record.title, body: build.note, power_before: build.powerBefore, power_after: build.powerAfter, power_unit: build.powerUnit };
  if (existing) db.prepare("UPDATE build_log SET date=@date, title=@title, body=@body, power_before=@power_before, power_after=@power_after, power_unit=@power_unit WHERE id=@id").run({ ...row, id: existing.id });
  else db.prepare(`INSERT INTO build_log (vehicle_id, date, title, body, created_by, service_id, power_before, power_after, power_unit)
    VALUES (@vehicle_id, @date, @title, @body, @created_by, @service_id, @power_before, @power_after, @power_unit)`).run({ ...row, vehicle_id: vehicleId, created_by: userId, service_id: serviceId });
}

function parse(b: any) {
  if (!SERVICE_CATEGORIES.includes(b.category)) throw bad("Invalid category");
  const items: any[] = Array.isArray(b.items) ? b.items : [];
  if (items.length > 200) throw bad("Too many parts on one record");
  return {
    record: {
      date: day(b.date),
      reading: numOrNull(b.reading, "reading"),
      title: requiredText(b.title, "Title", 160),
      category: b.category as string,
      labor_hours: numOrNull(b.laborHours, "labor hours", 100_000),
      labor_cost_cents: cents(b.laborCostCents),
      notes: text(b.notes, 8000),
    },
    items: items.map(i => ({
      kind: i?.kind === "fluid" ? "fluid" : "part",
      name: requiredText(i?.name, "Part name", 160),
      part_number: text(i?.partNumber, 80),
      brand: text(i?.brand, 80),
      quantity: numOrNull(i?.quantity, "quantity", 1e6),
      unit: text(i?.unit, 20),
      cost_cents: cents(i?.costCents),
      inventory_id: i?.inventoryId === null || i?.inventoryId === undefined || i?.inventoryId === "" ? null : int(i.inventoryId, "inventory item"),
      url: webLink(i?.url, "Store link"),
    })),
    scheduleIds: (Array.isArray(b.scheduleIds) ? b.scheduleIds : []).map((x: unknown) => int(x, "schedule item")) as number[],
    build: parseBuild(b.build),
  };
}

function writeChildren(userId: number, serviceId: number, vehicleId: number, p: ReturnType<typeof parse>) {
  // Checked before the old lines are deleted, since keeping an existing link depends on them.
  for (const i of p.items) if (i.inventory_id !== null) assertInventoryUsable(userId, i.inventory_id, serviceId);
  db.prepare("DELETE FROM service_items WHERE service_id = ?").run(serviceId);
  db.prepare("DELETE FROM service_tasks WHERE service_id = ?").run(serviceId);
  const addItem = db.prepare(`INSERT INTO service_items (service_id, kind, name, part_number, brand, quantity, unit, cost_cents, inventory_id, url)
    VALUES (@service_id, @kind, @name, @part_number, @brand, @quantity, @unit, @cost_cents, @inventory_id, @url)`);
  for (const i of p.items) addItem.run({ ...i, service_id: serviceId });
  const belongs = db.prepare("SELECT 1 FROM schedule_items WHERE id = ? AND vehicle_id = ?");
  const addTask = db.prepare("INSERT OR IGNORE INTO service_tasks (service_id, schedule_id) VALUES (?, ?)");
  for (const id of p.scheduleIds) {
    // A schedule id from someone else's vehicle must not be able to reset that vehicle's due dates.
    if (!belongs.get(id, vehicleId)) throw bad("That schedule item isn't on this vehicle");
    addTask.run(serviceId, id);
  }
}

export function createService(userId: number, vehicleId: number, b: any): number {
  requireVehicle(userId, vehicleId, "edit");
  const p = parse(b);
  return db.transaction(() => {
    const info = db.prepare(`INSERT INTO service_records (vehicle_id, date, reading, title, category, labor_hours, labor_cost_cents, notes, created_by)
      VALUES (@vehicle_id, @date, @reading, @title, @category, @labor_hours, @labor_cost_cents, @notes, @created_by)`)
      .run({ ...p.record, vehicle_id: vehicleId, created_by: userId });
    const id = Number(info.lastInsertRowid);
    writeChildren(userId, id, vehicleId, p);
    syncBuildLog(userId, id, vehicleId, p.record, p.build);
    return id;
  })();
}

export function updateService(userId: number, id: number, b: any) {
  const vehicleId = vehicleOf(id);
  requireVehicle(userId, vehicleId, "edit");
  const p = parse(b);
  db.transaction(() => {
    db.prepare(`UPDATE service_records SET date=@date, reading=@reading, title=@title, category=@category, labor_hours=@labor_hours,
      labor_cost_cents=@labor_cost_cents, notes=@notes WHERE id=@id`).run({ ...p.record, id });
    writeChildren(userId, id, vehicleId, p);
    syncBuildLog(userId, id, vehicleId, p.record, p.build);
  })();
}

export function deleteService(userId: number, id: number) {
  requireVehicle(userId, vehicleOf(id), "edit");
  db.prepare("DELETE FROM service_records WHERE id = ?").run(id);
}
