import { db } from "../db";
import { notFound, requiredText, text } from "../api";
import type { Spec } from "../types";
import { requireVehicle } from "./vehicles";

export function listSpecs(vehicleId: number): Spec[] {
  return db.prepare("SELECT id, label, value, notes FROM vehicle_specs WHERE vehicle_id = ? ORDER BY label COLLATE NOCASE").all(vehicleId) as Spec[];
}

const parse = (b: any) => ({
  label: requiredText(b.label, "Label", 120),
  value: requiredText(b.value, "Value", 200),
  notes: text(b.notes, 4000),
});

export function createSpec(userId: number, vehicleId: number, b: any): number {
  requireVehicle(userId, vehicleId, "edit");
  const info = db.prepare("INSERT INTO vehicle_specs (vehicle_id, label, value, notes) VALUES (@vehicle_id, @label, @value, @notes)").run({ ...parse(b), vehicle_id: vehicleId });
  return Number(info.lastInsertRowid);
}

function owned(userId: number, id: number) {
  const r = db.prepare("SELECT vehicle_id FROM vehicle_specs WHERE id = ?").get(id) as { vehicle_id: number } | undefined;
  if (!r) throw notFound("Spec not found");
  requireVehicle(userId, r.vehicle_id, "edit");
}

export function updateSpec(userId: number, id: number, b: any) {
  owned(userId, id);
  db.prepare("UPDATE vehicle_specs SET label=@label, value=@value, notes=@notes WHERE id=@id").run({ ...parse(b), id });
}

export function deleteSpec(userId: number, id: number) {
  owned(userId, id);
  db.prepare("DELETE FROM vehicle_specs WHERE id = ?").run(id);
}
