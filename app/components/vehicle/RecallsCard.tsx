"use client";

import { useState } from "react";
import { api, fmtDate, useApi } from "@/lib/client";
import type { Recall, Vehicle } from "@/lib/types";

type Data = { recalls: Recall[]; checkedAt: string | null };

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());

/**
 * Safety recalls for this year, make and model, kept out of the way: one collapsed line at the bottom of the
 * overview, and nothing at all when there are none or they've been hidden. "Hide all" clears the list until a new
 * recall comes out.
 */
export default function RecallsCard({ vehicle: v }: { vehicle: Vehicle }) {
  const { data, setData } = useApi<Data>(`/api/vehicles/${v.id}/recalls`);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const canEdit = v.role !== "viewer";
  if (!v.year || !v.make || !v.model || !data || data.recalls.length === 0) return null;

  async function patch(body: object) {
    setBusy(true); setErr("");
    try { setData(await api<Data>(`/api/vehicles/${v.id}/recalls`, { method: "PATCH", body })); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  }
  const vinLink = v.vin && /^[A-HJ-NPR-Z0-9]{17}$/i.test(v.vin) ? `https://www.nhtsa.gov/recalls?vin=${encodeURIComponent(v.vin)}` : "https://www.nhtsa.gov/recalls";
  const n = data.recalls.length;

  return (
    <details className="recall-quiet section" open={open} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>{n === 1 ? "1 recall" : `${n} recalls`} on file for the {v.year} {v.make} {v.model}</summary>
      <div className="recall-quiet-body">
        <p className="form-hint">
          These are for every {v.year} {v.make} {v.model}, and yours may already be fixed. <a href={vinLink} target="_blank" rel="noopener noreferrer" className="text-cyan">Check your VIN</a>.
          {canEdit && <> <button type="button" className="link-btn" disabled={busy} onClick={() => patch({ all: true, status: "dismissed" })}>Hide all</button></>}
        </p>
        {err && <p className="form-error">{err}</p>}
        {data.recalls.map(r => (
          <div key={r.campaign} className="recall-item">
            <div className="recall-item-head">
              <b>{titleCase((r.component ?? "Recall").split(":")[0])}</b>
              <span className="row-sub">{r.reported ? fmtDate(r.reported) : r.campaign}</span>
            </div>
            {r.summary && <p>{r.summary}</p>}
            {r.remedy && <p><b>Fix:</b> {r.remedy}</p>}
            {canEdit && (
              <div className="flex gap-2">
                <button type="button" className="link-btn" disabled={busy} onClick={() => patch({ campaign: r.campaign, status: "done" })}>Fixed</button>
                <button type="button" className="link-btn" disabled={busy} onClick={() => patch({ campaign: r.campaign, status: "dismissed" })}>Hide</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
