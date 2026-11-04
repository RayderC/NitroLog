import { db } from "../db";
import type { VehicleReport } from "../types";
import { listVehicles } from "./vehicles";

export function vehicleReport(vehicleId: number): Omit<VehicleReport, "vehicleId" | "name" | "currency" | "meterType" | "archived"> {
  const byCategory = db.prepare(`SELECT s.category, SUM(s.labor_cost_cents + COALESCE(p.c, 0)) AS cents
    FROM service_records s
    LEFT JOIN (SELECT service_id, SUM(cost_cents) c FROM service_items GROUP BY service_id) p ON p.service_id = s.id
    WHERE s.vehicle_id = ? GROUP BY s.category`).all(vehicleId) as { category: string; cents: number }[];

  const fuelCents = (db.prepare("SELECT COALESCE(SUM(cost_cents), 0) c FROM fuel_logs WHERE vehicle_id = ?").get(vehicleId) as { c: number }).c;
  const wishlistCents = (db.prepare(`SELECT COALESCE(SUM(COALESCE(actual_cents, planned_cents)), 0) c FROM wishlist_items
    WHERE vehicle_id = ? AND status != 'planned'`).get(vehicleId) as { c: number }).c;

  const byYear = db.prepare(`SELECT year, SUM(cents) AS cents FROM (
      SELECT substr(s.date, 1, 4) AS year, s.labor_cost_cents + COALESCE((SELECT SUM(i.cost_cents) FROM service_items i WHERE i.service_id = s.id), 0) AS cents
      FROM service_records s WHERE s.vehicle_id = @v
      UNION ALL SELECT substr(date, 1, 4), cost_cents FROM fuel_logs WHERE vehicle_id = @v
    ) GROUP BY year ORDER BY year`).all({ v: vehicleId }) as { year: string; cents: number }[];

  const span = db.prepare(`SELECT MIN(r) lo, MAX(r) hi FROM (
      SELECT reading r FROM odometer_readings WHERE vehicle_id = @v
      UNION ALL SELECT reading FROM service_records WHERE vehicle_id = @v
      UNION ALL SELECT reading FROM fuel_logs WHERE vehicle_id = @v
    )`).get({ v: vehicleId }) as { lo: number | null; hi: number | null };

  const labor = (db.prepare("SELECT COALESCE(SUM(labor_hours), 0) h FROM service_records WHERE vehicle_id = ?").get(vehicleId) as { h: number }).h;
  const serviceCents = byCategory.reduce((sum, c) => sum + c.cents, 0);

  return {
    byCategory: byCategory.filter(c => c.cents > 0).sort((a, b) => b.cents - a.cents),
    byYear: byYear.filter(y => y.cents > 0),
    serviceCents, fuelCents, wishlistCents,
    totalCents: serviceCents + fuelCents + wishlistCents,
    laborHours: labor,
    tracked: span.lo !== null && span.hi !== null ? span.hi - span.lo : 0,
  };
}

export function reports(userId: number): VehicleReport[] {
  return listVehicles(userId).map(v => ({
    vehicleId: v.id, name: v.name, currency: v.currency, meterType: v.meterType, archived: v.archived, ...vehicleReport(v.id),
  }));
}
