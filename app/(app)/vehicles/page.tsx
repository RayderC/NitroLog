"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "@/app/components/Icon";
import { useMe } from "@/app/components/MeContext";
import VehicleForm from "@/app/components/VehicleForm";
import { fmtDate, useApi } from "@/lib/client";
import { KINDS } from "@/lib/templates";
import type { Vehicle } from "@/lib/types";
import { fmtMoney, fmtReading } from "@/lib/units";

export default function GaragePage() {
  const { me } = useMe();
  const router = useRouter();
  const { data, error } = useApi<Vehicle[]>("/api/vehicles");
  const [adding, setAdding] = useState(false);

  const active = data?.filter(v => !v.archived) ?? [];
  const archived = data?.filter(v => v.archived && !v.soldOn) ?? [];
  const sold = data?.filter(v => v.soldOn) ?? [];

  const card = (v: Vehicle) => (
    <Link key={v.id} href={`/vehicles/${v.id}`} className="row-card">
      <div className="row-top">
        <span className="row-title">{v.name}</span>
        <span className="flex gap-2">
          {v.role !== "owner" && <span className="badge badge-cyan">{v.role === "editor" ? "Can edit" : "View only"}</span>}
          {v.role === "owner" && v.shared && <span className="badge badge-purple">Shared</span>}
        </span>
      </div>
      <div className="row-stats">
        <span>{KINDS.find(k => k.value === v.kind)?.label}</span>
        <span><b>{fmtReading(v.reading, v.meterType, me.distanceUnit)}</b></span>
        {v.soldOn && <span>Sold {fmtDate(v.soldOn)}{v.soldCents !== null ? ` for ${fmtMoney(v.soldCents, v.currency)}` : ""}</span>}
        {v.role !== "owner" && <span>Owner {v.ownerName}</span>}
      </div>
    </Link>
  );

  return (
    <div className="page">
      <div className="dash-header">
        <div><h1 className="dash-title">Garage</h1><p className="dash-subtitle">Everything you own or have been given access to</p></div>
        <button className="btn-primary btn-sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Add vehicle</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {!data ? !error && <div className="loading">Loading…</div> : (
        <>
          {data.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon"><Icon name="car" size={36} /></div>
              <div className="empty-state-title">No vehicles yet</div>
              <p className="empty-state-desc">Add a car, bike, ATV or project to start tracking it.</p>
            </div>
          )}
          <div className="row-list section">{active.map(card)}</div>
          {archived.length > 0 && (
            <section className="section">
              <div className="section-header"><h2 className="section-title">Archived</h2></div>
              <div className="row-list">{archived.map(card)}</div>
            </section>
          )}
          {sold.length > 0 && (
            <details className="section sold-group">
              <summary className="section-title"><Icon name="chevron" size={15} /> Sold ({sold.length})</summary>
              <div className="row-list">{sold.map(card)}</div>
            </details>
          )}
        </>
      )}
      {adding && <VehicleForm onClose={() => setAdding(false)} onDone={id => router.push(`/vehicles/${id}`)} />}
    </div>
  );
}
