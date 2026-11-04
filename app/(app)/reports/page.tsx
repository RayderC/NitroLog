"use client";

import { useState } from "react";
import Icon from "@/app/components/Icon";
import { useMe } from "@/app/components/MeContext";
import { useApi } from "@/lib/client";
import type { VehicleReport } from "@/lib/types";
import { fmtMoney, fromMeters, meterUnit, type DistanceUnit } from "@/lib/units";

/** One series, so no legend: the card title names it, and every bar carries its label and value as text. */
function CostBars({ rows, currency }: { rows: { label: string; cents: number }[]; currency: string }) {
  const max = Math.max(...rows.map(r => r.cents), 1);
  return (
    <div className="cost-bars">
      {rows.map(r => {
        const value = fmtMoney(r.cents, currency);
        return (
          <div key={r.label} className="cost-bar" title={`${r.label}: ${value}`}>
            <span className="cost-bar-label capitalize">{r.label}</span>
            <span className="cost-bar-track"><i style={{ width: `${Math.max(1, (r.cents / max) * 100)}%` }} /></span>
            <span className="cost-bar-value">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

function costPer(r: VehicleReport, du: DistanceUnit): string {
  const running = r.serviceCents + r.fuelCents;
  if (r.tracked <= 0 || running <= 0) return "—";
  const span = r.meterType === "hours" ? r.tracked : fromMeters(r.tracked, du);
  return fmtMoney(running / span, r.currency);
}

function Report({ r, du }: { r: VehicleReport; du: DistanceUnit }) {
  const unit = meterUnit(r.meterType, du);
  return (
    <section className="section">
      <div className="section-header"><h2 className="section-title">{r.name}{r.archived && <span className="row-sub"> archived</span>}</h2></div>
      <div className="stats-grid build-stats">
        <div className="stat-card"><div className="stat-card-label">Total cost</div><div className="stat-card-value sm">{fmtMoney(r.totalCents, r.currency)}</div></div>
        <div className="stat-card"><div className="stat-card-label">Cost per {unit}</div><div className="stat-card-value sm">{costPer(r, du)}</div><div className="stat-card-sub">Service and fuel</div></div>
        <div className="stat-card"><div className="stat-card-label">Fuel</div><div className="stat-card-value sm">{fmtMoney(r.fuelCents, r.currency)}</div></div>
        <div className="stat-card"><div className="stat-card-label">Labor</div><div className="stat-card-value sm">{r.laborHours.toLocaleString()}<small> hr</small></div></div>
      </div>
      {r.totalCents === 0 ? <p className="settings-hint">No costs logged yet.</p> : (
        <div className="grid-2">
          <div className="card">
            <div className="card-title report-title">Service by category</div>
            {r.byCategory.length ? <CostBars currency={r.currency} rows={r.byCategory.map(c => ({ label: c.category, cents: c.cents }))} /> : <p className="settings-hint">No service costs yet.</p>}
          </div>
          <div className="card">
            <div className="card-title report-title">Service and fuel by year</div>
            {r.byYear.length ? <CostBars currency={r.currency} rows={r.byYear.map(y => ({ label: y.year, cents: y.cents }))} /> : <p className="settings-hint">No dated costs yet.</p>}
          </div>
        </div>
      )}
      {r.wishlistCents > 0 && <p className="settings-hint report-note">The total includes {fmtMoney(r.wishlistCents, r.currency)} of wishlist parts bought. Those have no purchase date, so they aren't in the yearly chart.</p>}
    </section>
  );
}

export default function ReportsPage() {
  const { me } = useMe();
  const { data, error } = useApi<VehicleReport[]>("/api/reports");
  const [selected, setSelected] = useState<number | "all">("all");

  if (error) return <div className="page"><p className="form-error">{error}</p></div>;
  if (!data) return <div className="loading">Loading…</div>;

  const shown = data.filter(r => selected === "all" || r.vehicleId === selected);
  // Vehicles can use different currencies and nothing is converted, so totals only add up within one.
  const totals = new Map<string, number>();
  for (const r of data) totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.totalCents);

  return (
    <div className="page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Reports</h1>
          <p className="dash-subtitle">{data.length ? [...totals].map(([c, cents]) => fmtMoney(cents, c)).join(" + ") + " across your garage" : "Add a vehicle to see costs"}</p>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon"><Icon name="chart" size={36} /></div><div className="empty-state-title">Nothing to report yet</div></div>
      ) : (
        <>
          {data.length > 1 && (
            <div className="chip-wrap section">
              <button className={`filter-chip ${selected === "all" ? "active" : ""}`} onClick={() => setSelected("all")}>All vehicles</button>
              {data.map(r => <button key={r.vehicleId} className={`filter-chip ${selected === r.vehicleId ? "active" : ""}`} onClick={() => setSelected(r.vehicleId)}>{r.name}</button>)}
            </div>
          )}
          {shown.map(r => <Report key={r.vehicleId} r={r} du={me.distanceUnit} />)}
        </>
      )}
    </div>
  );
}
