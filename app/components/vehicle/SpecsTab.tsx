"use client";

import { useState } from "react";
import Icon from "@/app/components/Icon";
import Modal from "@/app/components/Modal";
import { api, useApi } from "@/lib/client";
import type { Spec, Vehicle } from "@/lib/types";

const SUGGESTED = ["Oil type", "Oil capacity", "Oil filter", "Drain plug torque", "Air filter", "Cabin filter", "Tire size", "Tire pressure", "Lug nut torque", "Spark plugs", "Coolant type", "Brake fluid", "Battery size", "Chain size"];

export default function SpecsTab({ vehicle: v }: { vehicle: Vehicle }) {
  const { data, error, reload } = useApi<Spec[]>(`/api/vehicles/${v.id}/specs`);
  const [editing, setEditing] = useState<Spec | "new" | null>(null);
  const canEdit = v.role !== "viewer";

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <div className="loading">Loading…</div>;

  return (
    <div className="section">
      {canEdit && <div className="tab-actions"><button className="btn-primary btn-sm" onClick={() => setEditing("new")}><Icon name="plus" size={14} /> Add spec</button></div>}
      {data.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon name="note" size={36} /></div>
          <div className="empty-state-title">No specs saved</div>
          <p className="empty-state-desc">Keep oil types, torque values, filter numbers and how-to notes here for next time.</p>
        </div>
      ) : (
        <div className="row-list">
          {data.map(s => {
            const body = (
              <>
                <div className="row-top"><span className="row-sub">{s.label}</span></div>
                <div className="row-title">{s.value}</div>
                {s.notes && <p className="row-body pre-wrap">{s.notes}</p>}
              </>
            );
            return canEdit
              ? <button key={s.id} className="row-card" onClick={() => setEditing(s)}>{body}</button>
              : <div key={s.id} className="row-card">{body}</div>;
          })}
        </div>
      )}
      {editing && <SpecForm vehicleId={v.id} spec={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function SpecForm({ vehicleId, spec, onClose, onDone }: { vehicleId: number; spec?: Spec; onClose: () => void; onDone: () => void }) {
  const [label, setLabel] = useState(spec?.label ?? "");
  const [value, setValue] = useState(spec?.value ?? "");
  const [notes, setNotes] = useState(spec?.notes ?? "");
  const [err, setErr] = useState("");

  async function save() {
    setErr("");
    try {
      const body = { label, value, notes };
      if (spec) await api(`/api/specs/${spec.id}`, { method: "PATCH", body });
      else await api(`/api/vehicles/${vehicleId}/specs`, { body });
      onDone();
    } catch (x) { setErr((x as Error).message); }
  }

  async function remove() {
    if (!spec || !confirm(`Delete ${spec.label}?`)) return;
    try { await api(`/api/specs/${spec.id}`, { method: "DELETE" }); onDone(); }
    catch (x) { setErr((x as Error).message); }
  }

  const footer = (
    <>
      {spec && <button className="btn-danger" onClick={remove}>Delete</button>}
      <button className="btn-primary" onClick={save} disabled={!label.trim() || !value.trim()}>Save</button>
    </>
  );

  return (
    <Modal title={spec ? "Edit spec" : "Add spec"} onClose={onClose} footer={footer}>
      <div className="form-stack">
        {err && <p className="form-error">{err}</p>}
        <div className="form-group">
          <label className="form-label" htmlFor="sp-label">What is it?</label>
          <input id="sp-label" className="form-input" list="spec-labels" value={label} onChange={e => setLabel(e.target.value)} autoFocus={!spec} />
          <datalist id="spec-labels">{SUGGESTED.map(s => <option key={s} value={s} />)}</datalist>
        </div>
        <div className="form-group"><label className="form-label" htmlFor="sp-value">Value</label><input id="sp-value" className="form-input" placeholder="e.g. 5W-30 full synthetic" value={value} onChange={e => setValue(e.target.value)} /></div>
        <div className="form-group"><label className="form-label" htmlFor="sp-notes">Notes / how-to</label><textarea id="sp-notes" className="form-textarea" rows={4} value={notes} onChange={e => setNotes(e.target.value)} /></div>
      </div>
    </Modal>
  );
}
