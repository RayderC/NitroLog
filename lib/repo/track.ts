import { db } from "../db";
import { bad, day, notFound, numOrNull, requiredText, text } from "../api";
import type { TrackBest, TrackDay } from "../types";
import { requireVehicle } from "./vehicles";

type DayRow = { id: number; date: string; track: string; conditions: string | null; setup: string | null; notes: string | null };
type SessionRow = {
  id: number; track_day_id: number; name: string | null; laps: number | null; best_lap_ms: number | null;
  pressure_fl: number | null; pressure_fr: number | null; pressure_rl: number | null; pressure_rr: number | null; notes: string | null;
};

export function listTrack(vehicleId: number): { days: TrackDay[]; bests: TrackBest[] } {
  const days = db.prepare("SELECT id, date, track, conditions, setup, notes FROM track_days WHERE vehicle_id = ? ORDER BY date DESC, id DESC").all(vehicleId) as DayRow[];
  const sessions = db.prepare(`SELECT s.* FROM track_sessions s JOIN track_days d ON d.id = s.track_day_id WHERE d.vehicle_id = ? ORDER BY s.id`).all(vehicleId) as SessionRow[];
  const bests = db.prepare(`SELECT d.track, MIN(s.best_lap_ms) AS best, COUNT(DISTINCT d.id) AS visits
    FROM track_days d LEFT JOIN track_sessions s ON s.track_day_id = d.id WHERE d.vehicle_id = ? GROUP BY d.track ORDER BY d.track COLLATE NOCASE`).all(vehicleId) as { track: string; best: number | null; visits: number }[];
  return {
    bests: bests.map(b => ({ track: b.track, bestLapMs: b.best, visits: b.visits })),
    days: days.map(d => ({
      ...d,
      sessions: sessions.filter(s => s.track_day_id === d.id).map(s => ({
        name: s.name, laps: s.laps, bestLapMs: s.best_lap_ms, pressureFl: s.pressure_fl, pressureFr: s.pressure_fr,
        pressureRl: s.pressure_rl, pressureRr: s.pressure_rr, notes: s.notes,
      })),
    })),
  };
}

function parse(b: any) {
  const sessions: any[] = Array.isArray(b.sessions) ? b.sessions : [];
  if (sessions.length > 100) throw bad("Too many sessions on one day");
  return {
    day: {
      date: day(b.date),
      track: requiredText(b.track, "Track", 120),
      conditions: text(b.conditions, 200),
      setup: text(b.setup, 8000),
      notes: text(b.notes, 8000),
    },
    sessions: sessions.map(s => {
      const laps = numOrNull(s?.laps, "laps", 100_000);
      const best = numOrNull(s?.bestLapMs, "lap time", 86_400_000);
      if (laps !== null && !Number.isInteger(laps)) throw bad("Laps must be a whole number");
      if (best !== null && !Number.isInteger(best)) throw bad("Invalid lap time");
      return {
        name: text(s?.name, 80), laps, best_lap_ms: best,
        pressure_fl: numOrNull(s?.pressureFl, "pressure", 1000), pressure_fr: numOrNull(s?.pressureFr, "pressure", 1000),
        pressure_rl: numOrNull(s?.pressureRl, "pressure", 1000), pressure_rr: numOrNull(s?.pressureRr, "pressure", 1000),
        notes: text(s?.notes, 2000),
      };
    }),
  };
}

function writeSessions(dayId: number, sessions: ReturnType<typeof parse>["sessions"]) {
  db.prepare("DELETE FROM track_sessions WHERE track_day_id = ?").run(dayId);
  const add = db.prepare(`INSERT INTO track_sessions (track_day_id, name, laps, best_lap_ms, pressure_fl, pressure_fr, pressure_rl, pressure_rr, notes)
    VALUES (@track_day_id, @name, @laps, @best_lap_ms, @pressure_fl, @pressure_fr, @pressure_rl, @pressure_rr, @notes)`);
  for (const s of sessions) add.run({ ...s, track_day_id: dayId });
}

export function createTrackDay(userId: number, vehicleId: number, b: any): number {
  requireVehicle(userId, vehicleId, "edit");
  const p = parse(b);
  return db.transaction(() => {
    const info = db.prepare(`INSERT INTO track_days (vehicle_id, date, track, conditions, setup, notes, created_by)
      VALUES (@vehicle_id, @date, @track, @conditions, @setup, @notes, @created_by)`).run({ ...p.day, vehicle_id: vehicleId, created_by: userId });
    const id = Number(info.lastInsertRowid);
    writeSessions(id, p.sessions);
    return id;
  })();
}

function owned(userId: number, id: number) {
  const r = db.prepare("SELECT vehicle_id FROM track_days WHERE id = ?").get(id) as { vehicle_id: number } | undefined;
  if (!r) throw notFound("Track day not found");
  requireVehicle(userId, r.vehicle_id, "edit");
}

export function updateTrackDay(userId: number, id: number, b: any) {
  owned(userId, id);
  const p = parse(b);
  db.transaction(() => {
    db.prepare("UPDATE track_days SET date=@date, track=@track, conditions=@conditions, setup=@setup, notes=@notes WHERE id=@id").run({ ...p.day, id });
    writeSessions(id, p.sessions);
  })();
}

export function deleteTrackDay(userId: number, id: number) {
  owned(userId, id);
  db.prepare("DELETE FROM track_days WHERE id = ?").run(id);
}
