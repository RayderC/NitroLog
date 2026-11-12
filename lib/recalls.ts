// Safety recalls for each vehicle, from NHTSA's free public recall list, checked about once a week.
// Kept quiet on purpose: the first check of a vehicle only fills the list in the app, with no alert. After that,
// a recall that wasn't there before sends one alert to the people on that vehicle who have recall alerts on.
// Done and "not for my car" recalls are hidden and never alert again.
import { db } from "./db";
import { bad } from "./api";
import type { Recall } from "./types";

const WEEK = 7 * 24 * 60 * 60 * 1000;
const STATUSES = ["open", "done", "dismissed"] as const;

type NhtsaRecall = {
  NHTSACampaignNumber?: string; Component?: string; Summary?: string; Consequence?: string; Remedy?: string;
  ReportReceivedDate?: string; parkIt?: string | boolean;
};

const clip = (s: unknown, n: number) => (typeof s === "string" && s.trim() ? s.replace(/\s+/g, " ").trim().slice(0, n) : null);

/** NHTSA writes dates as day/month/year. Stored as year-month-day. */
function isoDate(s: string | undefined): string | null {
  const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Recalls NHTSA lists for a year, make and model. Throws when NHTSA can't be reached. Exported for tests. */
export async function fetchRecalls(year: number, make: string, model: string): Promise<NhtsaRecall[]> {
  const q = new URLSearchParams({ make: make.trim(), model: model.trim(), modelYear: String(year) });
  const res = await fetch(`https://api.nhtsa.gov/recalls/recallsByVehicle?${q}`, {
    headers: { Accept: "application/json", "User-Agent": "NitroLog/1.0 (personal vehicle maintenance log)" },
    signal: AbortSignal.timeout(15_000),
  });
  // NHTSA answers 400 for a make or model it doesn't know, which just means no recalls on file.
  if (res.status === 400 || res.status === 404) return [];
  if (!res.ok) throw new Error(`NHTSA answered ${res.status}`);
  const j = await res.json() as { results?: NhtsaRecall[] };
  return Array.isArray(j.results) ? j.results : [];
}

type VehicleRow = { id: number; name: string; year: number | null; make: string | null; model: string | null; vin: string | null; recalls_checked_at: string | null };

/** Checks one vehicle and stores what's new. Returns the recalls that are new since the last check. */
export async function checkVehicleRecalls(vehicleId: number): Promise<{ added: Recall[]; first: boolean }> {
  const v = db.prepare("SELECT id, name, year, make, model, vin, recalls_checked_at FROM vehicles WHERE id = ?").get(vehicleId) as VehicleRow | undefined;
  if (!v || !v.year || !v.make?.trim() || !v.model?.trim()) return { added: [], first: false };
  const found = await fetchRecalls(v.year, v.make, v.model);
  const first = v.recalls_checked_at === null;
  const insert = db.prepare(`INSERT OR IGNORE INTO vehicle_recalls (vehicle_id, campaign, component, summary, consequence, remedy, reported, park_it, notified)
    VALUES (@vehicle_id, @campaign, @component, @summary, @consequence, @remedy, @reported, @park_it, @notified)`);
  const addedIds: string[] = [];
  db.transaction(() => {
    for (const r of found) {
      const campaign = clip(r.NHTSACampaignNumber, 20);
      if (!campaign || !/^[\w-]+$/.test(campaign)) continue;
      const info = insert.run({
        vehicle_id: v.id, campaign, component: clip(r.Component, 200), summary: clip(r.Summary, 3000),
        consequence: clip(r.Consequence, 2000), remedy: clip(r.Remedy, 2000), reported: isoDate(r.ReportReceivedDate),
        park_it: r.parkIt === true || r.parkIt === "True" ? 1 : 0,
        // The first look at a vehicle fills the list without alerting anyone.
        notified: first ? 1 : 0,
      });
      if (info.changes && !first) addedIds.push(campaign);
    }
    db.prepare("UPDATE vehicles SET recalls_checked_at = ? WHERE id = ?").run(new Date().toISOString(), v.id);
  })();
  return { added: listRecalls(v.id, true).filter(r => addedIds.includes(r.campaign)), first };
}

type RecallRow = { campaign: string; component: string | null; summary: string | null; consequence: string | null; remedy: string | null; reported: string | null; park_it: number; status: Recall["status"] };

export function listRecalls(vehicleId: number, includeClosed = false): Recall[] {
  const rows = db.prepare(`SELECT campaign, component, summary, consequence, remedy, reported, park_it, status FROM vehicle_recalls
    WHERE vehicle_id = ? ${includeClosed ? "" : "AND status = 'open'"} ORDER BY reported DESC, campaign DESC`).all(vehicleId) as RecallRow[];
  return rows.map(r => ({ campaign: r.campaign, component: r.component, summary: r.summary, consequence: r.consequence, remedy: r.remedy, reported: r.reported, parkIt: !!r.park_it, status: r.status }));
}

export function setRecallStatus(vehicleId: number, campaign: unknown, status: unknown) {
  if (typeof campaign !== "string" || !STATUSES.includes(status as Recall["status"])) throw bad("Invalid recall");
  const info = db.prepare("UPDATE vehicle_recalls SET status = ? WHERE vehicle_id = ? AND campaign = ?").run(status, vehicleId, campaign);
  if (!info.changes) throw bad("That recall isn't on this vehicle");
}

export const recallsCheckedAt = (vehicleId: number) =>
  (db.prepare("SELECT recalls_checked_at c FROM vehicles WHERE id = ?").get(vehicleId) as { c: string | null } | undefined)?.c ?? null;

/** People to tell about a vehicle's new recall: its owner and members, with recall alerts on. */
function recipients(vehicleId: number): number[] {
  return (db.prepare(`SELECT u.id FROM users u WHERE u.disabled = 0 AND u.recall_alerts = 1 AND (
      u.id = (SELECT owner_id FROM vehicles WHERE id = ?) OR u.id IN (SELECT user_id FROM vehicle_members WHERE vehicle_id = ?))`)
    .all(vehicleId, vehicleId) as { id: number }[]).map(r => r.id);
}

/**
 * One pass for the hourly job: vehicles not checked for a week, a few at a time so NHTSA isn't hammered.
 * Each vehicle with new recalls sends at most one alert per person, then those recalls are marked as told.
 */
export async function runRecallCheck(send: (userId: number, msg: { title: string; body: string; url: string }) => Promise<number>) {
  const cutoff = new Date(Date.now() - WEEK).toISOString();
  const due = db.prepare(`SELECT id, name FROM vehicles WHERE archived = 0 AND sold_on IS NULL AND year IS NOT NULL AND make IS NOT NULL AND model IS NOT NULL
    AND (recalls_checked_at IS NULL OR recalls_checked_at < ?) ORDER BY recalls_checked_at IS NOT NULL, recalls_checked_at LIMIT 10`).all(cutoff) as { id: number; name: string }[];
  for (const v of due) {
    try {
      await checkVehicleRecalls(v.id);
      const fresh = db.prepare("SELECT campaign, component, park_it FROM vehicle_recalls WHERE vehicle_id = ? AND notified = 0 AND status = 'open'").all(v.id) as { campaign: string; component: string | null; park_it: number }[];
      if (!fresh.length) continue;
      const urgent = fresh.some(r => r.park_it);
      const what = fresh.length === 1 ? (fresh[0].component ?? "a part").split(":")[0].toLowerCase() : `${fresh.length} parts`;
      const msg = {
        title: urgent ? `Don't drive the ${v.name} until it's fixed` : `New recall for the ${v.name}`,
        body: `A safety recall now covers ${what}. Open NitroLog to see what to do.`,
        url: `/vehicles/${v.id}`,
      };
      for (const userId of recipients(v.id)) await send(userId, msg);
      // Told once, whether or not a device took it. The recall stays on the vehicle page either way.
      db.prepare("UPDATE vehicle_recalls SET notified = 1 WHERE vehicle_id = ? AND notified = 0").run(v.id);
    } catch (e) {
      console.warn(`[recalls] vehicle ${v.id}:`, (e as Error).message);
    }
  }
}
