"use client";

import Link from "next/link";
import Icon from "@/app/components/Icon";
import { useMe } from "@/app/components/MeContext";
import { fmtDate, useApi } from "@/lib/client";
import type { ServiceSummary, Vehicle } from "@/lib/types";
import { fmtMoney, fmtReading } from "@/lib/units";

export default function ServiceTab({ vehicle: v }: { vehicle: Vehicle }) {
  const { me } = useMe();
  const { data, error } = useApi<ServiceSummary[]>(`/api/vehicles/${v.id}/service`);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <div className="loading">Loading…</div>;
  if (data.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon"><Icon name="wrench" size={36} /></div>
        <div className="empty-state-title">No service records yet</div>
        <p className="empty-state-desc">Log a job to record its parts, labor and notes.</p>
      </div>
    );
  }
  return (
    <div className="row-list section">
      {data.map(s => (
        <Link key={s.id} href={`/service/${s.id}`} className="row-card">
          <div className="row-top">
            <span className="row-title">{s.title}</span>
            <span className="row-sub">{fmtDate(s.date)}</span>
          </div>
          <div className="row-stats">
            <span className="capitalize">{s.category}</span>
            {s.reading !== null && <span>{fmtReading(s.reading, v.meterType, me.distanceUnit)}</span>}
            {s.totalCents > 0 && <span><b>{fmtMoney(s.totalCents, v.currency)}</b></span>}
            {s.laborHours !== null && <span>{s.laborHours} hr labor</span>}
            {s.loggedBy && <span>By {s.loggedBy}</span>}
          </div>
        </Link>
      ))}
    </div>
  );
}
