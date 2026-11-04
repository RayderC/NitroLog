import { db } from "../db";
import { bad, cents, day, notFound, numOrNull, text } from "../api";
import { computeEconomy } from "../fuel";
import type { FuelLog } from "../types";
import { requireVehicle } from "./vehicles";

type Row = { id: number; date: string; reading: number | null; volume_l: number; cost_cents: number; full_tank: number; notes: string | null };

export function listFuel(vehicleId: number): { logs: FuelLog[]; average: number | null } {
  const rows = db.prepare("SELECT * FROM fuel_logs WHERE vehicle_id = ? ORDER BY date DESC, id DESC").all(vehicleId) as Row[];
  const economy = computeEconomy(rows.map(r => ({ id: r.id, reading: r.reading, volumeL: r.volume_l, fullTank: !!r.full_tank })));
  return {
    average: economy.average,
    logs: rows.map(r => ({
      id: r.id, date: r.date, reading: r.reading, volumeL: r.volume_l, costCents: r.cost_cents,
      fullTank: !!r.full_tank, notes: r.notes, economy: economy.byId[r.id] ?? null,
    })),
  };
}

function parse(b: any) {
  const volume = numOrNull(b.volumeL, "amount", 1e6);
  if (!volume) throw bad("Enter how much fuel you added");
  return {
    date: day(b.date),
    reading: numOrNull(b.reading, "reading"),
    volume_l: volume,
    cost_cents: cents(b.costCents),
    full_tank: b.fullTank === false ? 0 : 1,
    notes: text(b.notes, 2000),
  };
}

export function createFuel(userId: number, vehicleId: number, b: any): number {
  requireVehicle(userId, vehicleId, "edit");
  const info = db.prepare(`INSERT INTO fuel_logs (vehicle_id, date, reading, volume_l, cost_cents, full_tank, notes, created_by)
    VALUES (@vehicle_id, @date, @reading, @volume_l, @cost_cents, @full_tank, @notes, @created_by)`).run({ ...parse(b), vehicle_id: vehicleId, created_by: userId });
  return Number(info.lastInsertRowid);
}

function owned(userId: number, id: number) {
  const r = db.prepare("SELECT vehicle_id FROM fuel_logs WHERE id = ?").get(id) as { vehicle_id: number } | undefined;
  if (!r) throw notFound("Fill-up not found");
  requireVehicle(userId, r.vehicle_id, "edit");
}

export function updateFuel(userId: number, id: number, b: any) {
  owned(userId, id);
  db.prepare(`UPDATE fuel_logs SET date=@date, reading=@reading, volume_l=@volume_l, cost_cents=@cost_cents, full_tank=@full_tank, notes=@notes WHERE id=@id`).run({ ...parse(b), id });
}

export function deleteFuel(userId: number, id: number) {
  owned(userId, id);
  db.prepare("DELETE FROM fuel_logs WHERE id = ?").run(id);
}
