"use client";

import Link from "next/link";
import { useState } from "react";
import Icon from "@/app/components/Icon";
import { useMe } from "@/app/components/MeContext";
import ReadingModal from "@/app/components/ReadingModal";
import VehicleForm from "@/app/components/VehicleForm";
import { localDay, useApi } from "@/lib/client";
import { dueText, intervalText, STATUS_BADGE } from "@/lib/dueText";
import type { ScheduleItem, Vehicle } from "@/lib/types";
import { fmtReading } from "@/lib/units";

export default function DuePage() {
  const { me } = useMe();
  const { data, error, reload } = useApi<{ vehicles: Vehicle[]; items: ScheduleItem[] }>(`/api/due?today=${localDay()}`);
  const [updating, setUpdating] = useState<Vehicle | null>(null);
  const [adding, setAdding] = useState(false);

  if (error) return <div className="page"><p className="form-error">{error}</p></div>;
  if (!data) return <div className="loading">Loading…</div>;

  const needsWork = data.items.filter(i => i.status === "overdue" || i.status === "soon" || i.status === "unknown");
  const overdue = data.items.filter(i => i.status === "overdue").length;
  const soon = data.items.filter(i => i.status === "soon").length;
  const editable = data.vehicles.filter(v => v.role !== "viewer");

  return (
    <div className="page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">What's due</h1>
          <p className="dash-subtitle">
            {data.vehicles.length === 0 ? "Your garage is empty" : `${overdue} overdue · ${soon} due soon · ${data.vehicles.length} ${data.vehicles.length === 1 ? "vehicle" : "vehicles"}`}
          </p>
        </div>
      </div>

      {data.vehicles.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon name="car" size={36} /></div>
          <div className="empty-state-title">Add your first vehicle</div>
          <p className="empty-state-desc">Pick a starter schedule, and NitroLog will show what's due here.</p>
          <button className="btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Add vehicle</button>
        </div>
      ) : (
        <>
          <section className="section">
            {needsWork.length === 0 ? (
              <div className="all-clear"><Icon name="check" size={18} /> Nothing is due. Every tracked service is up to date.</div>
            ) : (
              <div className="row-list">
                {needsWork.map(i => {
                  const badge = STATUS_BADGE[i.status];
                  return (
                    <div key={i.id} className={`row-card due-${i.status}`}>
                      <div className="row-top">
                        <span className="row-title">{i.name}</span>
                        <span className={`badge ${badge.cls}`}>{badge.label}</span>
                      </div>
                      <div className="row-sub"><Link href={`/vehicles/${i.vehicleId}?tab=schedule`} className="text-link">{i.vehicleName}</Link> · {intervalText(i, me.distanceUnit)}</div>
                      <div className="due-foot">
                        <span className="due-amount">{dueText(i, me.distanceUnit)}</span>
                        {i.canEdit && <Link className="btn-secondary btn-sm" href={`/service/new?vehicle=${i.vehicleId}&schedule=${i.id}`}>Log it</Link>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-header"><h2 className="section-title">Update readings</h2></div>
            <div className="row-list">
              {editable.map(v => (
                <div key={v.id} className="row-card reading-row">
                  <Link href={`/vehicles/${v.id}`} className="reading-main">
                    <span className="row-title">{v.name}</span>
                    <span className="row-sub">{fmtReading(v.reading, v.meterType, me.distanceUnit)}</span>
                  </Link>
                  <button className="btn-secondary btn-sm" onClick={() => setUpdating(v)}>Update</button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {updating && <ReadingModal vehicle={updating} onClose={() => setUpdating(null)} onDone={() => { setUpdating(null); reload(); }} />}
      {adding && <VehicleForm onClose={() => setAdding(false)} onDone={id => { window.location.href = `/vehicles/${id}`; }} />}
    </div>
  );
}
