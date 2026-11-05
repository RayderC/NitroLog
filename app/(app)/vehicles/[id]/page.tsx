"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Icon from "@/app/components/Icon";
import BuildTab from "@/app/components/vehicle/BuildTab";
import DocumentsTab from "@/app/components/vehicle/DocumentsTab";
import FuelTab from "@/app/components/vehicle/FuelTab";
import TrackTab from "@/app/components/vehicle/TrackTab";
import Overview from "@/app/components/vehicle/Overview";
import ScheduleTab from "@/app/components/vehicle/ScheduleTab";
import ServiceTab from "@/app/components/vehicle/ServiceTab";
import SharingTab from "@/app/components/vehicle/SharingTab";
import SpecsTab from "@/app/components/vehicle/SpecsTab";
import { fmtDate, useApi } from "@/lib/client";
import type { ReadingEntry, Vehicle } from "@/lib/types";
import { fmtMoney } from "@/lib/units";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "service", label: "Service" },
  { id: "schedule", label: "Schedule" },
  { id: "specs", label: "Specs" },
  { id: "documents", label: "Documents" },
  { id: "build", label: "Build" },
  { id: "track", label: "Track" },
  { id: "fuel", label: "Fuel" },
  { id: "sharing", label: "Sharing" },
];

function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState(() => {
    const t = params.get("tab");
    return TABS.some(x => x.id === t) ? t! : "overview";
  });
  const { data, error, reload } = useApi<{ vehicle: Vehicle; readings: ReadingEntry[] }>(`/api/vehicles/${id}`);

  if (error) return <div className="page"><div className="empty-state"><div className="empty-state-title">{error}</div><Link className="btn-secondary" href="/vehicles">Back to garage</Link></div></div>;
  if (!data) return <div className="loading">Loading…</div>;
  const { vehicle: v, readings } = data;
  // The name defaults to year, make and model, so don't repeat it underneath.
  const described = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
  const subtitle = [
    described !== v.name && described,
    v.archived && !v.soldOn && "Archived",
    v.role === "viewer" && "View only",
  ].filter(Boolean).join(" · ");

  return (
    <div className="page">
      <Link href="/vehicles" className="back-link"><Icon name="back" size={14} /> Garage</Link>
      <div className="dash-header">
        <div>
          <h1 className="dash-title">{v.name}</h1>
          {subtitle && <p className="dash-subtitle">{subtitle}</p>}
        </div>
        {v.role !== "viewer" && !v.archived && <Link className="btn-primary btn-sm" href={`/service/new?vehicle=${v.id}`}><Icon name="plus" size={14} /> Log service</Link>}
      </div>

      {v.soldOn && (
        <p className="sold-note section">
          <Icon name="check" size={15} />
          <span><b>Sold {fmtDate(v.soldOn)}{v.soldCents !== null ? ` for ${fmtMoney(v.soldCents, v.currency)}` : ""}.</b> Its records are all still here, and it no longer shows up in Due or reminders.</span>
        </p>
      )}

      <div className="tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === "overview" && <Overview vehicle={v} readings={readings} reload={reload} onDeleted={() => router.push("/vehicles")} />}
      {tab === "service" && <ServiceTab vehicle={v} />}
      {tab === "schedule" && <ScheduleTab vehicle={v} />}
      {tab === "specs" && <SpecsTab vehicle={v} />}
      {tab === "documents" && <DocumentsTab vehicle={v} />}
      {tab === "build" && <BuildTab vehicle={v} />}
      {tab === "track" && <TrackTab vehicle={v} />}
      {tab === "fuel" && <FuelTab vehicle={v} onChanged={reload} />}
      {tab === "sharing" && <SharingTab vehicle={v} reload={reload} onLeft={() => router.push("/vehicles")} />}
    </div>
  );
}

export default function VehiclePage() {
  return <Suspense fallback={<div className="loading">Loading…</div>}><VehicleDetail /></Suspense>;
}
