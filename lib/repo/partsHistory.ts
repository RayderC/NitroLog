import { db } from "../db";
import type { PartSuggestion, PartsHistory, ServiceItem, UsedPart } from "../types";
import { listInventory } from "./inventory";
import { listVehicles, requireVehicle } from "./vehicles";

type ItemRow = {
  kind: ServiceItem["kind"]; name: string; part_number: string | null; brand: string | null; quantity: number | null; unit: string | null;
  cost_cents: number; date: string; vehicle_id: number; vehicle_name: string; url: string | null;
};

/** A part's identity for de-duplicating: the same name, number and brand is the same part. */
const keyOf = (kind: string, name: string, partNumber: string | null, brand: string | null) =>
  [kind, name.trim().toLowerCase(), (partNumber ?? "").trim().toLowerCase(), (brand ?? "").trim().toLowerCase()].join("|");

/** What one unit cost, so a different quantity can be priced. Null when it wasn't recorded. */
function unitCost(costCents: number, quantity: number | null): number | null {
  if (!costCents) return null;
  return Math.round(costCents / (quantity && quantity > 0 ? quantity : 1));
}

/**
 * Everything the service form uses to fill itself in for one vehicle: parts and fluids used before
 * on any vehicle this person can see, their own stock, and what was used the last time each of
 * this vehicle's schedule items was done. All of it comes from data they can already read.
 */
export function partsHistory(userId: number, vehicleId: number): PartsHistory {
  requireVehicle(userId, vehicleId, "view");
  const ids = listVehicles(userId).map(v => v.id);
  const place = ids.map(() => "?").join(",");

  const rows = db.prepare(`SELECT i.kind, i.name, i.part_number, i.brand, i.quantity, i.unit, i.cost_cents, i.url, s.date, s.vehicle_id, v.name AS vehicle_name
    FROM service_items i JOIN service_records s ON s.id = i.service_id JOIN vehicles v ON v.id = s.vehicle_id
    WHERE s.vehicle_id IN (${place}) ORDER BY s.date DESC, s.id DESC, i.id`).all(...ids) as ItemRow[];

  const byKey = new Map<string, PartSuggestion>();
  for (const r of rows) {
    const k = keyOf(r.kind, r.name, r.part_number, r.brand);
    const hit = byKey.get(k);
    if (hit) {
      // Rows come newest first, so the first one seen holds the latest price.
      hit.uses++;
      if (r.vehicle_id === vehicleId) hit.onThisVehicle = true;
      if (hit.unitCostCents === null) hit.unitCostCents = unitCost(r.cost_cents, r.quantity);
      if (hit.url === null) hit.url = r.url;
      continue;
    }
    byKey.set(k, {
      source: "history", kind: r.kind, name: r.name, partNumber: r.part_number, brand: r.brand, unit: r.unit,
      quantity: r.quantity, unitCostCents: unitCost(r.cost_cents, r.quantity), lastDate: r.date, uses: 1,
      onThisVehicle: r.vehicle_id === vehicleId, vehicleName: r.vehicle_name, inventoryId: null, onHand: null, url: r.url,
    });
  }

  const stock: PartSuggestion[] = listInventory(userId).map(s => ({
    source: "stock", kind: "part", name: s.name, partNumber: s.partNumber, brand: s.brand, unit: s.unit, quantity: 1,
    unitCostCents: s.unitCostCents || null, lastDate: null, uses: 0, onThisVehicle: s.vehicleId === vehicleId,
    vehicleName: s.vehicleName, inventoryId: s.id, onHand: s.quantity, url: s.url,
  }));

  // The newest record on this vehicle for each schedule item that listed any parts.
  const last = db.prepare(`SELECT t.schedule_id, s.id AS service_id, s.date FROM service_tasks t
    JOIN service_records s ON s.id = t.service_id
    WHERE s.vehicle_id = ? AND EXISTS (SELECT 1 FROM service_items i WHERE i.service_id = s.id)
    ORDER BY s.date DESC, s.id DESC`).all(vehicleId) as { schedule_id: number; service_id: number; date: string }[];
  const items = db.prepare("SELECT kind, name, part_number, brand, quantity, unit, cost_cents, url FROM service_items WHERE service_id = ? ORDER BY id");
  const lastByTask: PartsHistory["lastByTask"] = {};
  for (const l of last) {
    if (lastByTask[l.schedule_id]) continue;
    lastByTask[l.schedule_id] = {
      serviceId: l.service_id, date: l.date,
      items: (items.all(l.service_id) as { kind: ServiceItem["kind"]; name: string; part_number: string | null; brand: string | null; quantity: number | null; unit: string | null; cost_cents: number; url: string | null }[])
        .map(i => ({ kind: i.kind, name: i.name, partNumber: i.part_number, brand: i.brand, quantity: i.quantity, unit: i.unit, costCents: i.cost_cents, inventoryId: null, url: i.url })),
    };
  }

  return { parts: [...stock, ...byKey.values()].slice(0, 500), lastByTask };
}

type UsedRow = {
  kind: ServiceItem["kind"]; name: string; part_number: string | null; brand: string | null; quantity: number | null; unit: string | null;
  cost_cents: number; url: string | null; date: string; service_id: number; vehicle_id: number; vehicle_name: string;
};

/**
 * Every part and fluid used on the vehicles this person can see, one entry per part (same name, number and brand),
 * newest first. For the Parts page: what was used, how often, on what, what it last cost, and where it was bought.
 */
export function usedParts(userId: number): UsedPart[] {
  const vehicles = listVehicles(userId);
  if (!vehicles.length) return [];
  const place = vehicles.map(() => "?").join(",");
  const rows = db.prepare(`SELECT i.kind, i.name, i.part_number, i.brand, i.quantity, i.unit, i.cost_cents, i.url, s.date, s.id AS service_id,
      s.vehicle_id, v.name AS vehicle_name
    FROM service_items i JOIN service_records s ON s.id = i.service_id JOIN vehicles v ON v.id = s.vehicle_id
    WHERE s.vehicle_id IN (${place}) ORDER BY s.date DESC, s.id DESC, i.id`).all(...vehicles.map(v => v.id)) as UsedRow[];
  const stock = listInventory(userId);
  const out = new Map<string, UsedPart>();
  for (const r of rows) {
    const key = keyOf(r.kind, r.name, r.part_number, r.brand);
    let p = out.get(key);
    if (!p) {
      p = {
        key, kind: r.kind, name: r.name, brand: r.brand, partNumber: r.part_number, unit: r.unit,
        uses: 0, totalQuantity: 0, spentCents: 0, lastDate: r.date, firstDate: r.date,
        lastUnitCents: null, url: null, lastServiceId: r.service_id, vehicles: [], onHand: null,
      };
      out.set(key, p);
    }
    // Rows come newest first, so the first price and link seen are the latest ones.
    p.uses++;
    p.totalQuantity += r.quantity && r.quantity > 0 ? r.quantity : 1;
    p.spentCents += r.cost_cents;
    p.firstDate = r.date;
    if (p.lastUnitCents === null) p.lastUnitCents = unitCost(r.cost_cents, r.kind === "fluid" ? null : r.quantity);
    if (p.url === null && r.url) p.url = r.url;
    if (!p.vehicles.some(v => v.id === r.vehicle_id)) p.vehicles.push({ id: r.vehicle_id, name: r.vehicle_name });
  }
  // Show what's on the shelf for parts that are also kept in stock.
  for (const s of stock) {
    // Shelf items don't say whether they're a part or a fluid, so either one matches.
    const p = out.get(keyOf("part", s.name, s.partNumber, s.brand)) ?? out.get(keyOf("fluid", s.name, s.partNumber, s.brand));
    if (p) { p.onHand = (p.onHand ?? 0) + s.quantity; if (!p.url && s.url) p.url = s.url; }
  }
  return [...out.values()];
}
