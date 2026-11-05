"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import Icon from "@/app/components/Icon";
import { useMe } from "@/app/components/MeContext";
import { fmtDate, localDay, useApi } from "@/lib/client";
import type { ServiceDetail, Spec, Vehicle } from "@/lib/types";
import { fmtMoney, fmtReading } from "@/lib/units";

export default function PrintHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useMe();
  const { data, error } = useApi<{ vehicle: Vehicle; service: ServiceDetail[]; specs: Spec[] }>(`/api/vehicles/${id}/history`);

  if (error) return <div className="page"><p className="form-error">{error}</p></div>;
  if (!data) return <div className="loading">Loading…</div>;
  const { vehicle: v, service, specs } = data;
  const total = service.reduce((sum, s) => sum + s.totalCents, 0);
  const details: [string, string | number | null][] = [
    ["Year", v.year], ["Make", v.make], ["Model", v.model], ["Trim", v.trim], ["Engine", v.engine], ["VIN", v.vin], ["Plate", v.plate],
    [v.soldOn ? "Final reading" : "Current reading", fmtReading(v.reading, v.meterType, me.distanceUnit)],
    ["Sold", v.soldOn && fmtDate(v.soldOn)],
  ];

  return (
    <div className="page print-page">
      <div className="no-print flex gap-2 justify-between section">
        <Link href={`/vehicles/${v.id}`} className="back-link"><Icon name="back" size={14} /> {v.name}</Link>
        <button className="btn-primary btn-sm" onClick={() => window.print()}><Icon name="print" size={14} /> Print or save as PDF</button>
      </div>

      <h1 className="dash-title">{v.name}: service history</h1>
      <p className="dash-subtitle section">Generated {fmtDate(localDay())} · {service.length} {service.length === 1 ? "record" : "records"} · {fmtMoney(total, v.currency)} total</p>

      <dl className="detail-list section">
        {details.filter(([, value]) => value !== null && value !== "").map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>

      {service.length === 0 && <p className="settings-hint">No service records yet.</p>}
      {service.map(s => (
        <article key={s.id} className="print-record">
          <div className="row-top">
            <span className="row-title">{s.title}</span>
            <span className="row-sub">{fmtDate(s.date)}{s.reading !== null ? ` · ${fmtReading(s.reading, v.meterType, me.distanceUnit)}` : ""}</span>
          </div>
          <div className="row-stats">
            <span className="capitalize">{s.category}</span>
            {s.totalCents > 0 && <span>{fmtMoney(s.totalCents, v.currency)}</span>}
            {s.laborHours !== null && <span>{s.laborHours} hr labor</span>}
          </div>
          {s.items.length > 0 && (
            <ul className="print-items">
              {s.items.map((i, n) => (
                <li key={n}>
                  {i.quantity !== null && `${i.quantity}${i.unit ? ` ${i.unit}` : ""} `}
                  {[i.brand, i.name].filter(Boolean).join(" ")}
                  {i.partNumber && ` (${i.partNumber})`}
                  {i.costCents > 0 && `: ${fmtMoney(i.costCents, v.currency)}`}
                </li>
              ))}
            </ul>
          )}
          {s.notes && <p className="row-body pre-wrap">{s.notes}</p>}
        </article>
      ))}

      {specs.length > 0 && (
        <section className="section print-specs">
          <h2 className="section-title">Specs</h2>
          <dl className="detail-list">
            {specs.map(s => <div key={s.id}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}
          </dl>
        </section>
      )}
    </div>
  );
}
