"use client";

import Link from "next/link";
import { useState } from "react";
import Icon from "@/app/components/Icon";
import { useMe } from "@/app/components/MeContext";
import ReadingModal from "@/app/components/ReadingModal";
import VehicleForm from "@/app/components/VehicleForm";
import { api, fmtDate } from "@/lib/client";
import { KINDS } from "@/lib/templates";
import type { ReadingEntry, Vehicle } from "@/lib/types";
import { fmtReading } from "@/lib/units";

const SOURCE = { manual: "Manual update", service: "Service", fuel: "Fill-up" };

export default function Overview({ vehicle: v, readings, reload, onDeleted }: {
  vehicle: Vehicle; readings: ReadingEntry[]; reload: () => void; onDeleted: () => void;
}) {
  const { me } = useMe();
  const [updating, setUpdating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState("");
  const canEdit = v.role !== "viewer";

  async function act(fn: () => Promise<unknown>, after: () => void = reload) {
    setErr("");
    try { await fn(); after(); } catch (x) { setErr((x as Error).message); }
  }

  const details: [string, string | number | null][] = [
    ["Type", KINDS.find(k => k.value === v.kind)?.label ?? v.kind],
    ["Engine", v.engine],
    ["VIN", v.vin],
    ["Plate", v.plate],
    ["Currency", v.currency],
    ["Owner", v.ownerName],
  ];

  return (
    <>
      {err && <p className="form-error" style={{ marginBottom: 12 }}>{err}</p>}
      <div className="card section reading-hero">
        <div>
          <div className="stat-card-label">Current reading</div>
          <div className="stat-card-value">{fmtReading(v.reading, v.meterType, me.distanceUnit)}</div>
        </div>
        {canEdit && <button className="btn-secondary btn-sm" onClick={() => setUpdating(true)}>Update</button>}
      </div>

      <div className="card section">
        <div className="card-header"><div className="card-title">Details</div>{canEdit && <button className="btn-secondary btn-sm" onClick={() => setEditing(true)}><Icon name="edit" size={14} /> Edit</button>}</div>
        <dl className="detail-list">
          {details.filter(([, value]) => value).map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
        {v.notes && <p className="detail-notes">{v.notes}</p>}
      </div>

      <section className="section">
        <div className="section-header"><h2 className="section-title">Readings</h2></div>
        {readings.length === 0 ? <p className="settings-hint">No readings logged yet.</p> : (
          <div className="card">
            {readings.map(r => (
              <div key={`${r.source}-${r.id}`} className="ready-row">
                <span>
                  <b>{fmtReading(r.reading, v.meterType, me.distanceUnit)}</b>
                  <span className="row-sub"> {fmtDate(r.date)} · {SOURCE[r.source]}{r.by ? ` · ${r.by}` : ""}</span>
                </span>
                {canEdit && r.source === "manual" && (
                  <button className="icon-btn" aria-label="Delete reading" onClick={() => { if (confirm("Delete this reading?")) act(() => api(`/api/readings/${r.id}`, { method: "DELETE" })); }}><Icon name="trash" size={15} /></button>
                )}
                {r.source === "service" && <Link className="icon-btn" aria-label="Open service record" href={`/service/${r.id}`}><Icon name="chevron" size={15} /></Link>}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="section"><Link className="btn-secondary btn-sm" href={`/vehicles/${v.id}/print`}><Icon name="print" size={14} /> Printable history</Link></div>

      {canEdit && (
        <div className="flex gap-2 section" style={{ flexWrap: "wrap" }}>
          <button className="btn-secondary btn-sm" onClick={() => act(() => api(`/api/vehicles/${v.id}`, { method: "PATCH", body: { archived: !v.archived } }))}>
            {v.archived ? "Restore from archive" : "Archive (sold or stored)"}
          </button>
          {v.role === "owner" && (
            <button className="btn-danger btn-sm" onClick={() => {
              if (confirm(`Delete ${v.name} and its entire history? This can't be undone. Archive it instead if you want to keep the records.`)) {
                act(() => api(`/api/vehicles/${v.id}`, { method: "DELETE" }), onDeleted);
              }
            }}>Delete vehicle</button>
          )}
        </div>
      )}

      {updating && <ReadingModal vehicle={v} onClose={() => setUpdating(false)} onDone={() => { setUpdating(false); reload(); }} />}
      {editing && <VehicleForm vehicle={v} onClose={() => setEditing(false)} onDone={() => { setEditing(false); reload(); }} />}
    </>
  );
}
