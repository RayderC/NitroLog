import crypto from "crypto";
import { db } from "../db";
import { bad, cents, day, numOrNull, requiredText, text } from "../api";
import { SERVICE_CATEGORIES } from "../types";
import { requireVehicle } from "./vehicles";

const MAX_ROWS = 20_000;

/**
 * Rows arrive already mapped and converted by the import page. Each one gets a key from its contents, so
 * importing an overlapping file later only adds what's new.
 */
export function importRows(userId: number, vehicleId: number, b: any): { added: number; skipped: number } {
  requireVehicle(userId, vehicleId, "edit");
  const type = b?.type;
  if (type !== "service" && type !== "fuel") throw bad("Choose service records or fill-ups");
  const rows: any[] = Array.isArray(b?.rows) ? b.rows : [];
  if (rows.length === 0) throw bad("There's nothing to import");
  if (rows.length > MAX_ROWS) throw bad(`Import up to ${MAX_ROWS.toLocaleString()} rows at a time`);

  const key = (r: object) => crypto.createHash("sha256").update(JSON.stringify([vehicleId, type, r])).digest("hex");

  return db.transaction(() => {
    let added = 0;
    let skipped = 0;
    if (type === "service") {
      const insert = db.prepare(`INSERT OR IGNORE INTO service_records (vehicle_id, date, reading, title, category, notes, created_by, import_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      const addCost = db.prepare("INSERT INTO service_items (service_id, kind, name, cost_cents) VALUES (?, 'part', 'Imported cost', ?)");
      rows.forEach((r, n) => {
        const row = {
          date: day(r?.date, `date on row ${n + 1}`),
          reading: numOrNull(r?.reading, `reading on row ${n + 1}`),
          title: requiredText(r?.title, `Title on row ${n + 1}`, 160),
          category: SERVICE_CATEGORIES.includes(r?.category) ? r.category as string : "maintenance",
          notes: text(r?.notes, 8000),
          costCents: cents(r?.costCents),
        };
        const info = insert.run(vehicleId, row.date, row.reading, row.title, row.category, row.notes, userId, key(row));
        if (!info.changes) { skipped++; return; }
        added++;
        if (row.costCents > 0) addCost.run(info.lastInsertRowid, row.costCents);
      });
    } else {
      const insert = db.prepare(`INSERT OR IGNORE INTO fuel_logs (vehicle_id, date, reading, volume_l, cost_cents, full_tank, notes, created_by, import_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      rows.forEach((r, n) => {
        const volume = numOrNull(r?.volumeL, `amount on row ${n + 1}`, 1e6);
        if (!volume) throw bad(`Row ${n + 1} needs a fuel amount`);
        const row = {
          date: day(r?.date, `date on row ${n + 1}`),
          reading: numOrNull(r?.reading, `reading on row ${n + 1}`),
          volumeL: volume,
          costCents: cents(r?.costCents),
          notes: text(r?.notes, 2000),
        };
        const info = insert.run(vehicleId, row.date, row.reading, row.volumeL, row.costCents, 1, row.notes, userId, key(row));
        if (info.changes) added++; else skipped++;
      });
    }
    return { added, skipped };
  })();
}
