"use client";

import { useState } from "react";
import Icon from "@/app/components/Icon";
import { useMe } from "@/app/components/MeContext";
import Modal from "@/app/components/Modal";
import { api, fmtDate, localDay, parseNum, useApi } from "@/lib/client";
import type { FuelLog, Vehicle } from "@/lib/types";
import { fmtEconomy, fmtMoney, fmtReading, fromLiters, meterUnit, readingFromInput, readingToInput, toCents, toLiters } from "@/lib/units";

export default function FuelTab({ vehicle: v, onChanged }: { vehicle: Vehicle; onChanged: () => void }) {
  const { me } = useMe();
  const { data, error, reload } = useApi<{ logs: FuelLog[]; average: number | null }>(`/api/vehicles/${v.id}/fuel`);
  const [editing, setEditing] = useState<FuelLog | "new" | null>(null);
  const canEdit = v.role !== "viewer";
  // Economy needs distance. On an hour-metered vehicle there's nothing meaningful to divide by.
  const showEconomy = v.meterType === "distance";

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <div className="loading">Loading…</div>;

  const volume = (l: number) => `${fromLiters(l, me.volumeUnit).toFixed(2)} ${me.volumeUnit}`;

  return (
    <div className="section">
      <div className="tab-actions">
        {showEconomy && data.average !== null && <span className="fuel-average">Average <b>{fmtEconomy(data.average, me.distanceUnit, me.volumeUnit)}</b></span>}
        {canEdit && <button className="btn-primary btn-sm" onClick={() => setEditing("new")}><Icon name="plus" size={14} /> Add fill-up</button>}
      </div>
      {data.logs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon name="fuel" size={36} /></div>
          <div className="empty-state-title">No fill-ups logged</div>
          <p className="empty-state-desc">This is optional. Nothing else in NitroLog depends on it.</p>
        </div>
      ) : (
        <div className="row-list">
          {data.logs.map(l => {
            const body = (
              <>
                <div className="row-top">
                  <span className="row-title">{volume(l.volumeL)}{!l.fullTank && <span className="row-sub"> partial</span>}</span>
                  <span className="row-sub">{fmtDate(l.date)}</span>
                </div>
                <div className="row-stats">
                  {l.reading !== null && <span>{fmtReading(l.reading, v.meterType, me.distanceUnit)}</span>}
                  {l.costCents > 0 && <span>{fmtMoney(l.costCents, v.currency)}</span>}
                  {showEconomy && l.economy !== null && <span><b>{fmtEconomy(l.economy, me.distanceUnit, me.volumeUnit)}</b></span>}
                </div>
                {l.notes && <p className="row-body">{l.notes}</p>}
              </>
            );
            return canEdit
              ? <button key={l.id} className="row-card" onClick={() => setEditing(l)}>{body}</button>
              : <div key={l.id} className="row-card">{body}</div>;
          })}
        </div>
      )}
      {editing && (
        <FuelForm vehicle={v} log={editing === "new" ? undefined : editing} onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); reload(); onChanged(); }} />
      )}
    </div>
  );
}

function FuelForm({ vehicle: v, log, onClose, onDone }: { vehicle: Vehicle; log?: FuelLog; onClose: () => void; onDone: () => void }) {
  const { me } = useMe();
  const startReading = log ? log.reading : null;
  const [f, setF] = useState({
    date: log?.date ?? localDay(),
    reading: startReading === null ? "" : String(readingToInput(startReading, v.meterType, me.distanceUnit)),
    volume: log ? String(Math.round(fromLiters(log.volumeL, me.volumeUnit) * 1000) / 1000) : "",
    cost: log && log.costCents ? (log.costCents / 100).toFixed(2) : "",
    notes: log?.notes ?? "",
  });
  const [full, setFull] = useState(log?.fullTank ?? true);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr("");
    const volume = parseNum(f.volume);
    const reading = parseNum(f.reading);
    const cost = parseNum(f.cost);
    if (volume === null) return setErr("Enter how much fuel you added");
    if (f.reading.trim() !== "" && reading === null) return setErr("The reading must be a number");
    if (f.cost.trim() !== "" && cost === null) return setErr("The cost must be a number");
    const body = {
      date: f.date, notes: f.notes, fullTank: full,
      volumeL: toLiters(volume, me.volumeUnit),
      reading: reading === null ? null : readingFromInput(reading, v.meterType, me.distanceUnit),
      costCents: cost === null ? 0 : toCents(cost),
    };
    try {
      if (log) await api(`/api/fuel/${log.id}`, { method: "PATCH", body });
      else await api(`/api/vehicles/${v.id}/fuel`, { body });
      onDone();
    } catch (x) { setErr((x as Error).message); }
  }

  async function remove() {
    if (!log || !confirm("Delete this fill-up?")) return;
    try { await api(`/api/fuel/${log.id}`, { method: "DELETE" }); onDone(); }
    catch (x) { setErr((x as Error).message); }
  }

  const footer = (
    <>
      {log && <button className="btn-danger" onClick={remove}>Delete</button>}
      <button className="btn-primary" onClick={save} disabled={!f.volume.trim()}>Save</button>
    </>
  );

  return (
    <Modal title={log ? "Edit fill-up" : "Add fill-up"} onClose={onClose} footer={footer}>
      <div className="form-stack">
        {err && <p className="form-error">{err}</p>}
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label" htmlFor="fu-date">Date</label><input id="fu-date" type="date" className="form-input" value={f.date} onChange={set("date")} /></div>
          <div className="form-group"><label className="form-label" htmlFor="fu-read">Reading ({meterUnit(v.meterType, me.distanceUnit)})</label><input id="fu-read" className="form-input" inputMode="decimal" value={f.reading} onChange={set("reading")} /></div>
          <div className="form-group"><label className="form-label" htmlFor="fu-vol">Amount ({me.volumeUnit})</label><input id="fu-vol" className="form-input" inputMode="decimal" value={f.volume} onChange={set("volume")} /></div>
          <div className="form-group"><label className="form-label" htmlFor="fu-cost">Total cost ({v.currency})</label><input id="fu-cost" className="form-input" inputMode="decimal" value={f.cost} onChange={set("cost")} /></div>
        </div>
        <label className="check-row"><input type="checkbox" checked={full} onChange={e => setFull(e.target.checked)} /> Filled the tank</label>
        <div className="form-group"><label className="form-label" htmlFor="fu-notes">Notes</label><input id="fu-notes" className="form-input" value={f.notes} onChange={set("notes")} /></div>
      </div>
    </Modal>
  );
}
