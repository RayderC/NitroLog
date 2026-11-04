"use client";

import { useState } from "react";
import Icon from "@/app/components/Icon";
import { useMe } from "@/app/components/MeContext";
import Modal from "@/app/components/Modal";
import { api, fmtDate, localDay, parseNum, useApi } from "@/lib/client";
import { fmtLap, parseLap } from "@/lib/lap";
import type { TrackBest, TrackDay, TrackSession, Vehicle } from "@/lib/types";
import { fromKpa, pressureUnit, toKpa, type DistanceUnit } from "@/lib/units";

export default function TrackTab({ vehicle: v }: { vehicle: Vehicle }) {
  const { me } = useMe();
  const { data, error, reload } = useApi<{ days: TrackDay[]; bests: TrackBest[] }>(`/api/vehicles/${v.id}/track`);
  const [editing, setEditing] = useState<TrackDay | "new" | null>(null);
  const canEdit = v.role !== "viewer";
  const unit = pressureUnit(me.distanceUnit);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <div className="loading">Loading…</div>;

  const pressures = (s: TrackSession) => {
    const all = [s.pressureFl, s.pressureFr, s.pressureRl, s.pressureRr];
    if (all.every(p => p === null)) return null;
    return `${all.map(p => (p === null ? "—" : fromKpa(p, me.distanceUnit))).join(" / ")} ${unit}`;
  };

  return (
    <div className="section">
      {canEdit && <div className="tab-actions"><button className="btn-primary btn-sm" onClick={() => setEditing("new")}><Icon name="plus" size={14} /> Add track day</button></div>}

      {data.bests.length > 0 && (
        <section className="section">
          <div className="section-header"><h2 className="section-title">Best laps</h2></div>
          <div className="card">
            {data.bests.map(b => (
              <div key={b.track} className="ready-row">
                <span>{b.track} <span className="row-sub">{b.visits} {b.visits === 1 ? "visit" : "visits"}</span></span>
                <b>{fmtLap(b.bestLapMs)}</b>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.days.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon name="flag" size={36} /></div>
          <div className="empty-state-title">No track days yet</div>
          <p className="empty-state-desc">Log sessions, lap times, tire pressures and your setup.</p>
        </div>
      ) : (
        <div className="row-list">
          {data.days.map(d => (
            <div key={d.id} className="row-card">
              <div className="row-top">
                <span className="row-title">{d.track}</span>
                <span className="flex gap-2 items-center">
                  <span className="row-sub">{fmtDate(d.date)}</span>
                  {canEdit && <button className="icon-btn" aria-label={`Edit ${d.track} on ${d.date}`} onClick={() => setEditing(d)}><Icon name="edit" size={15} /></button>}
                </span>
              </div>
              {d.conditions && <div className="row-sub">{d.conditions}</div>}
              {d.sessions.length > 0 && (
                <div className="table-wrap track-table">
                  <table className="data-table">
                    <thead><tr><th>Session</th><th>Laps</th><th>Best</th><th>FL / FR / RL / RR</th></tr></thead>
                    <tbody>
                      {d.sessions.map((s, i) => (
                        <tr key={i}>
                          <td>{s.name ?? `Session ${i + 1}`}</td>
                          <td>{s.laps ?? "—"}</td>
                          <td className="text-mono">{fmtLap(s.bestLapMs)}</td>
                          <td className="text-mono">{pressures(s) ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {d.setup && <p className="row-body pre-wrap"><b>Setup:</b> {d.setup}</p>}
              {d.notes && <p className="row-body pre-wrap">{d.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TrackForm vehicleId={v.id} day={editing === "new" ? undefined : editing} du={me.distanceUnit}
          knownTracks={data.bests.map(b => b.track)} lastSetup={data.days[0]?.setup ?? ""}
          onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

type Row = { name: string; laps: string; lap: string; fl: string; fr: string; rl: string; rr: string; notes: string };
const blank = (): Row => ({ name: "", laps: "", lap: "", fl: "", fr: "", rl: "", rr: "", notes: "" });

function TrackForm({ vehicleId, day, du, knownTracks, lastSetup, onClose, onDone }: {
  vehicleId: number; day?: TrackDay; du: DistanceUnit; knownTracks: string[]; lastSetup: string; onClose: () => void; onDone: () => void;
}) {
  const shown = (p: number | null) => (p === null ? "" : String(fromKpa(p, du)));
  const [f, setF] = useState({
    date: day?.date ?? localDay(), track: day?.track ?? "", conditions: day?.conditions ?? "",
    // A new day starts from the last setup, since that's usually where you start from.
    setup: day?.setup ?? lastSetup, notes: day?.notes ?? "",
  });
  const [rows, setRows] = useState<Row[]>(day?.sessions.length ? day.sessions.map(s => ({
    name: s.name ?? "", laps: s.laps?.toString() ?? "", lap: s.bestLapMs === null ? "" : fmtLap(s.bestLapMs),
    fl: shown(s.pressureFl), fr: shown(s.pressureFr), rl: shown(s.pressureRl), rr: shown(s.pressureRr), notes: s.notes ?? "",
  })) : [blank()]);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const setRow = (i: number, k: keyof Row) => (e: React.ChangeEvent<HTMLInputElement>) => setRows(rows.map((r, n) => (n === i ? { ...r, [k]: e.target.value } : r)));

  function pressure(s: string): number | null {
    if (!s.trim()) return null;
    const n = parseNum(s);
    if (n === null) throw new Error("Tire pressures must be numbers");
    return toKpa(n, du);
  }

  async function save() {
    setErr("");
    try {
      const sessions = rows.filter(r => Object.values(r).some(x => x.trim())).map((r, i) => {
        const best = r.lap.trim() ? parseLap(r.lap) : null;
        if (r.lap.trim() && best === null) throw new Error(`Session ${i + 1}: write lap times like 1:32.456`);
        const laps = r.laps.trim() ? parseNum(r.laps) : null;
        if (r.laps.trim() && laps === null) throw new Error(`Session ${i + 1}: laps must be a number`);
        return { name: r.name, laps, bestLapMs: best, notes: r.notes, pressureFl: pressure(r.fl), pressureFr: pressure(r.fr), pressureRl: pressure(r.rl), pressureRr: pressure(r.rr) };
      });
      const body = { ...f, sessions };
      if (day) await api(`/api/track/${day.id}`, { method: "PATCH", body });
      else await api(`/api/vehicles/${vehicleId}/track`, { body });
      onDone();
    } catch (x) { setErr((x as Error).message); }
  }

  async function remove() {
    if (!day || !confirm(`Delete this day at ${day.track}?`)) return;
    try { await api(`/api/track/${day.id}`, { method: "DELETE" }); onDone(); }
    catch (x) { setErr((x as Error).message); }
  }

  const footer = (
    <>
      {day && <button className="btn-danger" onClick={remove}>Delete</button>}
      <button className="btn-primary" onClick={save} disabled={!f.track.trim()}>Save</button>
    </>
  );

  return (
    <Modal wide title={day ? "Edit track day" : "Add track day"} onClose={onClose} footer={footer}>
      <div className="form-stack">
        {err && <p className="form-error">{err}</p>}
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label" htmlFor="t-track">Track</label>
            <input id="t-track" className="form-input" list="track-names" value={f.track} onChange={set("track")} autoFocus={!day} />
            <datalist id="track-names">{knownTracks.map(t => <option key={t} value={t} />)}</datalist>
          </div>
          <div className="form-group"><label className="form-label" htmlFor="t-date">Date</label><input id="t-date" type="date" className="form-input" value={f.date} onChange={set("date")} /></div>
        </div>
        <div className="form-group"><label className="form-label" htmlFor="t-cond">Conditions</label><input id="t-cond" className="form-input" placeholder="Dry, 72°F" value={f.conditions} onChange={set("conditions")} /></div>

        <span className="form-label">Sessions</span>
        {rows.map((r, i) => (
          <div key={i} className="session-box">
            <div className="part-head">
              <span className="row-sub">Session {i + 1}</span>
              <button type="button" className="icon-btn" aria-label={`Remove session ${i + 1}`} onClick={() => setRows(rows.filter((_, n) => n !== i))}><Icon name="x" size={15} /></button>
            </div>
            <div className="form-grid-3">
              <input className="form-input" placeholder="Name" aria-label="Session name" value={r.name} onChange={setRow(i, "name")} />
              <input className="form-input" inputMode="numeric" placeholder="Laps" aria-label="Laps" value={r.laps} onChange={setRow(i, "laps")} />
              <input className="form-input" placeholder="Best 1:32.456" aria-label="Best lap" value={r.lap} onChange={setRow(i, "lap")} />
            </div>
            <div className="pressure-grid">
              {(["fl", "fr", "rl", "rr"] as const).map(k => (
                <input key={k} className="form-input" inputMode="decimal" placeholder={`${k.toUpperCase()} ${pressureUnit(du)}`} aria-label={`${k.toUpperCase()} pressure in ${pressureUnit(du)}`} value={r[k]} onChange={setRow(i, k)} />
              ))}
            </div>
          </div>
        ))}
        <button type="button" className="add-set-btn" onClick={() => setRows([...rows, blank()])}><Icon name="plus" size={14} /> Session</button>

        <div className="form-group"><label className="form-label" htmlFor="t-setup">Setup</label><textarea id="t-setup" className="form-textarea" rows={3} placeholder="Camber, toe, damper clicks, sway bars" value={f.setup} onChange={set("setup")} /></div>
        <div className="form-group"><label className="form-label" htmlFor="t-notes">Notes</label><textarea id="t-notes" className="form-textarea" rows={3} value={f.notes} onChange={set("notes")} /></div>
      </div>
    </Modal>
  );
}
