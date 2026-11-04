"use client";

import Link from "next/link";
import { useState } from "react";
import Icon from "@/app/components/Icon";
import { useMe } from "@/app/components/MeContext";
import Modal from "@/app/components/Modal";
import { api, fmtDate, localDay, parseNum, useApi } from "@/lib/client";
import { dueText, intervalText, STATUS_BADGE } from "@/lib/dueText";
import type { ScheduleItem, Vehicle } from "@/lib/types";
import { fmtReading, meterUnit, readingFromInput, readingToInput } from "@/lib/units";

export default function ScheduleTab({ vehicle: v }: { vehicle: Vehicle }) {
  const { me } = useMe();
  const { data, error, reload } = useApi<ScheduleItem[]>(`/api/vehicles/${v.id}/schedule?today=${localDay()}`);
  const [editing, setEditing] = useState<ScheduleItem | "new" | null>(null);
  const canEdit = v.role !== "viewer";

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <div className="loading">Loading…</div>;

  return (
    <div className="section">
      {canEdit && <div className="tab-actions"><button className="btn-primary btn-sm" onClick={() => setEditing("new")}><Icon name="plus" size={14} /> Add item</button></div>}
      {data.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon name="list" size={36} /></div>
          <div className="empty-state-title">Nothing scheduled</div>
          <p className="empty-state-desc">Add what you want reminders for, like an oil change every 5,000 miles or 6 months.</p>
        </div>
      ) : (
        <div className="row-list">
          {data.map(i => {
            const badge = STATUS_BADGE[i.status];
            return (
              <div key={i.id} className={`row-card due-${i.status}`}>
                <div className="row-top">
                  <span className="row-title">{i.name}</span>
                  <span className={`badge ${badge.cls}`}>{badge.label}</span>
                </div>
                <div className="row-sub">{intervalText(i, me.distanceUnit)}</div>
                <div className="row-stats">
                  <span>Last done {fmtDate(i.lastDate)}{i.lastReading !== null ? ` at ${fmtReading(i.lastReading, v.meterType, me.distanceUnit)}` : ""}</span>
                </div>
                {i.notes && <p className="row-body">{i.notes}</p>}
                <div className="due-foot">
                  <span className="due-amount">{dueText(i, me.distanceUnit)}</span>
                  {canEdit && (
                    <span className="flex gap-2">
                      <button className="btn-secondary btn-sm" onClick={() => setEditing(i)}>Edit</button>
                      <Link className="btn-secondary btn-sm" href={`/service/new?vehicle=${v.id}&schedule=${i.id}`}>Log it</Link>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editing && <ScheduleForm vehicle={v} item={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function ScheduleForm({ vehicle: v, item, onClose, onDone }: { vehicle: Vehicle; item?: ScheduleItem; onClose: () => void; onDone: () => void }) {
  const { me } = useMe();
  const unit = meterUnit(v.meterType, me.distanceUnit);
  const shown = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(readingToInput(n, v.meterType, me.distanceUnit)));
  const [f, setF] = useState({
    name: item?.name ?? "",
    intervalReading: shown(item?.intervalReading),
    intervalMonths: item?.intervalMonths?.toString() ?? "",
    baseDate: item?.baseDate ?? localDay(),
    baseReading: item ? shown(item.baseReading) : shown(v.reading),
    notes: item?.notes ?? "",
  });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  function toStored(s: string, label: string): number | null {
    if (s.trim() === "") return null;
    const n = parseNum(s);
    if (n === null) throw new Error(`${label} must be a number`);
    return readingFromInput(n, v.meterType, me.distanceUnit);
  }

  async function save() {
    setErr("");
    try {
      const body = {
        name: f.name, notes: f.notes, intervalMonths: f.intervalMonths, baseDate: f.baseDate,
        intervalReading: toStored(f.intervalReading, "Interval"),
        baseReading: toStored(f.baseReading, "Last done reading"),
      };
      if (item) await api(`/api/schedule/${item.id}`, { method: "PATCH", body });
      else await api(`/api/vehicles/${v.id}/schedule`, { body });
      onDone();
    } catch (x) { setErr((x as Error).message); }
  }

  async function remove() {
    if (!item || !confirm(`Remove ${item.name} from the schedule? Past service records stay.`)) return;
    try { await api(`/api/schedule/${item.id}`, { method: "DELETE" }); onDone(); }
    catch (x) { setErr((x as Error).message); }
  }

  const footer = (
    <>
      {item && <button className="btn-danger" onClick={remove}>Delete</button>}
      <button className="btn-primary" onClick={save} disabled={!f.name.trim()}>Save</button>
    </>
  );

  return (
    <Modal title={item ? `Edit ${item.name}` : "Add schedule item"} onClose={onClose} footer={footer}>
      <div className="form-stack">
        {err && <p className="form-error">{err}</p>}
        <div className="form-group"><label className="form-label" htmlFor="s-name">Name</label><input id="s-name" className="form-input" value={f.name} onChange={set("name")} autoFocus={!item} /></div>
        <p className="form-hint">Fill in either limit or both. Whichever comes first makes it due.</p>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label" htmlFor="s-ir">Every ({unit})</label><input id="s-ir" className="form-input" inputMode="decimal" value={f.intervalReading} onChange={set("intervalReading")} /></div>
          <div className="form-group"><label className="form-label" htmlFor="s-im">Every (months)</label><input id="s-im" className="form-input" inputMode="numeric" value={f.intervalMonths} onChange={set("intervalMonths")} /></div>
        </div>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label" htmlFor="s-bd">Last done on</label><input id="s-bd" type="date" className="form-input" value={f.baseDate} onChange={set("baseDate")} /></div>
          <div className="form-group"><label className="form-label" htmlFor="s-br">Last done at ({unit})</label><input id="s-br" className="form-input" inputMode="decimal" value={f.baseReading} onChange={set("baseReading")} /></div>
        </div>
        {item && <p className="form-hint">Logging a service updates "last done" by itself. Only change these to correct your starting point.</p>}
        <div className="form-group"><label className="form-label" htmlFor="s-notes">Notes</label><textarea id="s-notes" className="form-textarea" rows={2} value={f.notes} onChange={set("notes")} /></div>
      </div>
    </Modal>
  );
}
