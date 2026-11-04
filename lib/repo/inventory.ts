import { db } from "../db";
import { bad, cents, int, notFound, numOrNull, requiredText, text } from "../api";
import type { InventoryItem } from "../types";
import { requireVehicle } from "./vehicles";

type Row = {
  id: number; vehicle_id: number | null; vehicle_name: string | null; name: string; part_number: string | null; brand: string | null;
  stock_in: number; used: number; unit: string | null; location: string | null; unit_cost_cents: number; min_quantity: number | null; notes: string | null;
};

/**
 * On-hand quantity is what was stocked minus what service records used, worked out when read. That way,
 * editing or deleting a service record puts the parts back with no extra code. A use with no quantity counts as 1.
 */
const SELECT = `SELECT i.*, v.name AS vehicle_name,
    (SELECT COALESCE(SUM(COALESCE(s.quantity, 1)), 0) FROM service_items s WHERE s.inventory_id = i.id) AS used
  FROM inventory_items i LEFT JOIN vehicles v ON v.id = i.vehicle_id`;

const toItem = (r: Row): InventoryItem => ({
  id: r.id, vehicleId: r.vehicle_id, vehicleName: r.vehicle_name, name: r.name, partNumber: r.part_number, brand: r.brand,
  quantity: Math.round((r.stock_in - r.used) * 1000) / 1000, unit: r.unit, location: r.location, unitCostCents: r.unit_cost_cents,
  minQuantity: r.min_quantity, notes: r.notes,
});

/** Inventory belongs to the person whose shelf it's on, even when it's earmarked for a shared vehicle. */
export function listInventory(userId: number): InventoryItem[] {
  const rows = db.prepare(`${SELECT} WHERE i.owner_id = ? ORDER BY i.name COLLATE NOCASE`).all(userId) as Row[];
  return rows.map(toItem);
}

function usedCount(id: number) {
  return (db.prepare("SELECT COALESCE(SUM(COALESCE(quantity, 1)), 0) u FROM service_items WHERE inventory_id = ?").get(id) as { u: number }).u;
}

function parse(userId: number, b: any) {
  let vehicleId: number | null = null;
  if (b.vehicleId !== null && b.vehicleId !== undefined && b.vehicleId !== "") {
    vehicleId = int(b.vehicleId, "vehicle");
    requireVehicle(userId, vehicleId, "view");
  }
  const quantity = numOrNull(b.quantity, "quantity", 1e6);
  if (quantity === null) throw bad("Enter how many you have");
  return {
    quantity,
    row: {
      vehicle_id: vehicleId,
      name: requiredText(b.name, "Name", 160),
      part_number: text(b.partNumber, 80),
      brand: text(b.brand, 80),
      unit: text(b.unit, 20),
      location: text(b.location, 120),
      unit_cost_cents: cents(b.unitCostCents),
      min_quantity: numOrNull(b.minQuantity, "minimum", 1e6),
      notes: text(b.notes, 2000),
    },
  };
}

export function createInventory(userId: number, b: any): number {
  const p = parse(userId, b);
  const info = db.prepare(`INSERT INTO inventory_items (owner_id, vehicle_id, name, part_number, brand, stock_in, unit, location, unit_cost_cents, min_quantity, notes)
    VALUES (@owner, @vehicle_id, @name, @part_number, @brand, @stock_in, @unit, @location, @unit_cost_cents, @min_quantity, @notes)`)
    .run({ ...p.row, owner: userId, stock_in: p.quantity });
  return Number(info.lastInsertRowid);
}

function owned(userId: number, id: number) {
  if (!db.prepare("SELECT 1 FROM inventory_items WHERE id = ? AND owner_id = ?").get(id, userId)) throw notFound("Part not found");
}

export function updateInventory(userId: number, id: number, b: any) {
  owned(userId, id);
  const p = parse(userId, b);
  // The form edits what's on hand now, so stock_in has to include everything already used.
  db.prepare(`UPDATE inventory_items SET vehicle_id=@vehicle_id, name=@name, part_number=@part_number, brand=@brand, stock_in=@stock_in,
    unit=@unit, location=@location, unit_cost_cents=@unit_cost_cents, min_quantity=@min_quantity, notes=@notes WHERE id=@id`)
    .run({ ...p.row, id, stock_in: p.quantity + usedCount(id) });
}

export function deleteInventory(userId: number, id: number) {
  owned(userId, id);
  db.prepare("DELETE FROM inventory_items WHERE id = ?").run(id);
}

/** A line can use your own stock, or keep a link that's already on the record, such as another editor's part. */
export function assertInventoryUsable(userId: number, inventoryId: number, serviceId: number | null) {
  if (db.prepare("SELECT 1 FROM inventory_items WHERE id = ? AND owner_id = ?").get(inventoryId, userId)) return;
  if (serviceId !== null && db.prepare("SELECT 1 FROM service_items WHERE service_id = ? AND inventory_id = ?").get(serviceId, inventoryId)) return;
  throw bad("That part isn't in your inventory");
}
