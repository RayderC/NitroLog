"use client";

import { useState } from "react";
import { api, fmtDate, useApi } from "@/lib/client";
import type { Recall, Vehicle } from "@/lib/types";

type Data = { recalls: Recall[]; checkedAt: string | null };

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());

/**
 * Open safety recalls for this year, make and model, from NHTSA. Quiet when there are none: one line, no card.
 * Recalls are listed by model, so the VIN link lets you check whether yours is already fixed.
 */
export default function RecallsCard({ vehicle: v }: { vehicle: Vehicle }) {
  const { data, setData: mutate } = useApi<Data>(`/api/vehicles/${v.id}/recalls`);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const canEdit = v.role !== "viewer";
  if (!v.year || !v.make || !v.model || !data) return null;

  async function run(fn: () => Promise<Data>) {
    setBusy(true); setErr("");
    try { mutate(await fn()); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }
  const check = () => run(() => api<Data>(`/api/vehicles/${v.id}/recalls`, { method: "POST" }));
  const mark = (campaign: string, status: "done" | "dismissed") => run(() => api<Data>(`/api/vehicles/${v.id}/recalls`, { method: "PATCH", body: { campaign, status } }));
  const vinLink = v.vin && /^[A-HJ-NPR-Z0-9]{17}$/i.test(v.vin) ? `https://www.nhtsa.gov/recalls?vin=${encodeURIComponent(v.vin)}` : "https://www.nhtsa.gov/recalls";

  if (data.recalls.length === 0) {
    return (
      <p className="settings-hint section recall-none">
        {data.checkedAt ? <>No open recalls for a {v.year} {v.make} {v.model}. Checked {fmtDate(data.checkedAt.slice(0, 10))}.</> : <>Recalls haven&apos;t been checked yet.</>}{" "}
        <button type="button" className="link-btn" disabled={busy} onClick={check}>{busy ? "Checking…" : "Check now"}</button>
        {err && <span className="form-error"> {err}</span>}
      </p>
    );
  }

  const urgent = data.recalls.some(r => r.parkIt);
  return (
    <div className={`card section recall-card ${urgent ? "urgent" : ""}`}>
      <div className="card-header">
        <div className="card-title">{data.recalls.length === 1 ? "1 open recall" : `${data.recalls.length} open recalls`}</div>
        <button type="button" className="link-btn" disabled={busy} onClick={check}>{busy ? "Checking…" : "Check now"}</button>
      </div>
      <p className="settings-hint">
        These cover every {v.year} {v.make} {v.model}. <a href={vinLink} target="_blank" rel="noopener noreferrer" className="text-cyan">Check your VIN on nhtsa.gov</a> to see
        whether yours needs them, and a dealer fixes them for free.
      </p>
      {err && <p className="form-error">{err}</p>}
      <div className="row-list">
        {data.recalls.map(r => (
          <div key={r.campaign} className="row-card recall-row">
            <button type="button" className="recall-head" aria-expanded={open === r.campaign} onClick={() => setOpen(open === r.campaign ? null : r.campaign)}>
              <span className="row-title">{titleCase((r.component ?? "Recall").split(":")[0])}</span>
              <span className="flex gap-2 items-center">
                {r.parkIt && <span className="badge badge-red">Don&apos;t drive</span>}
                <span className="row-sub">{r.reported ? fmtDate(r.reported) : r.campaign}</span>
              </span>
            </button>
            {open === r.campaign && (
              <div className="recall-body">
                {r.summary && <p>{r.summary}</p>}
                {r.consequence && <p><b>Risk:</b> {r.consequence}</p>}
                {r.remedy && <p><b>Fix:</b> {r.remedy}</p>}
                <p className="row-sub">NHTSA campaign {r.campaign}</p>
                {canEdit && (
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => mark(r.campaign, "done")}>It&apos;s been fixed</button>
                    <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => mark(r.campaign, "dismissed")}>Not for my car</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
