import { db } from "../db";
import { bad, day, notFound, numOrNull, requiredText, text } from "../api";
import { computeDue } from "../due";
import type { ScheduleItem, Vehicle } from "../types";
import { listVehicles, requireVehicle } from "./vehicles";

type Row = {
  id: number; vehicle_id: number; name: string; notes: string | null; interval_reading: number | null;
  interval_months: number | null; base_date: string; base_reading: number | null;
  done_date: string | null; done_reading: number | null;
};

/**
 * "Last done" is worked out from linked service records rather than stored, so editing or deleting a
 * record fixes the schedule by itself. The base values are what the user said when setting the item up.
 */
const SELECT = `SELECT s.*,
    (SELECT MAX(r.date) FROM service_tasks t JOIN service_records r ON r.id = t.service_id WHERE t.schedule_id = s.id) AS done_date,
    (SELECT MAX(r.reading) FROM service_tasks t JOIN service_records r ON r.id = t.service_id WHERE t.schedule_id = s.id) AS done_reading
  FROM schedule_items s`;

function toItem(r: Row, v: Vehicle, today: string): ScheduleItem {
  const lastDate = r.done_date && r.done_date > r.base_date ? r.done_date : r.base_date;
  const readings = [r.base_reading, r.done_reading].filter((x): x is number => x !== null);
  const lastReading = readings.length ? Math.max(...readings) : null;
  const due = computeDue({
    current: v.reading, lastReading, lastDate,
    intervalReading: r.interval_reading, intervalMonths: r.interval_months, today,
  });
  return {
    id: r.id, vehicleId: v.id, vehicleName: v.name, meterType: v.meterType, name: r.name, notes: r.notes,
    intervalReading: r.interval_reading, intervalMonths: r.interval_months,
    baseDate: r.base_date, baseReading: r.base_reading, lastDate, lastReading, ...due,
    urgency: isFinite(due.urgency) ? due.urgency : 1e9, // JSON has no Infinity
    canEdit: v.role !== "viewer",
  };
}

const byUrgency = (a: ScheduleItem, b: ScheduleItem) => a.urgency - b.urgency || a.name.localeCompare(b.name);

export function listSchedule(v: Vehicle, today: string): ScheduleItem[] {
  const rows = db.prepare(`${SELECT} WHERE s.vehicle_id = ?`).all(v.id) as Row[];
  return rows.map(r => toItem(r, v, today)).sort(byUrgency);
}

/** Everything due across every active vehicle this user can see. */
export function dueAcross(userId: number, today: string) {
  const vehicles = listVehicles(userId).filter(v => !v.archived);
  const items = vehicles.flatMap(v => listSchedule(v, today)).sort(byUrgency);
  return { vehicles, items };
}

function parse(b: any) {
  const intervalReading = numOrNull(b.intervalReading, "interval");
  const intervalMonths = numOrNull(b.intervalMonths, "months", 1200);
  if (intervalReading === 0 || intervalMonths === 0) throw bad("Intervals must be more than zero");
  if (intervalMonths !== null && !Number.isInteger(intervalMonths)) throw bad("Months must be a whole number");
  if (intervalReading === null && intervalMonths === null) throw bad("Set a distance, hours or months interval");
  return {
    name: requiredText(b.name, "Name", 120),
    notes: text(b.notes, 2000),
    interval_reading: intervalReading,
    interval_months: intervalMonths,
    base_date: day(b.baseDate, "last done date"),
    base_reading: numOrNull(b.baseReading, "last done reading"),
  };
}

export function createSchedule(userId: number, vehicleId: number, b: any): number {
  requireVehicle(userId, vehicleId, "edit");
  const info = db.prepare(`INSERT INTO schedule_items (vehicle_id, name, notes, interval_reading, interval_months, base_date, base_reading)
    VALUES (@vehicle_id, @name, @notes, @interval_reading, @interval_months, @base_date, @base_reading)`).run({ ...parse(b), vehicle_id: vehicleId });
  return Number(info.lastInsertRowid);
}

function ownedItem(userId: number, id: number) {
  const r = db.prepare("SELECT vehicle_id FROM schedule_items WHERE id = ?").get(id) as { vehicle_id: number } | undefined;
  if (!r) throw notFound("Schedule item not found");
  requireVehicle(userId, r.vehicle_id, "edit");
}

export function updateSchedule(userId: number, id: number, b: any) {
  ownedItem(userId, id);
  db.prepare(`UPDATE schedule_items SET name=@name, notes=@notes, interval_reading=@interval_reading, interval_months=@interval_months,
    base_date=@base_date, base_reading=@base_reading WHERE id=@id`).run({ ...parse(b), id });
}

export function deleteSchedule(userId: number, id: number) {
  ownedItem(userId, id);
  db.prepare("DELETE FROM schedule_items WHERE id = ?").run(id);
}
