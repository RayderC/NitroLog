"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/app/components/Icon";
import WatchButton, { watchFor } from "@/app/components/WatchButton";
import { fmtDate, useApi } from "@/lib/client";
import type { PriceWatch, UsedPart, Vehicle } from "@/lib/types";
import { fmtMoney } from "@/lib/units";

type Sort = "recent" | "uses" | "name" | "priceHigh" | "priceLow" | "spent";
type Show = "all" | "watched" | "linked";
type Kind = "all" | "part" | "fluid";

const SORTS: { value: Sort; label: string }[] = [
  { value: "recent", label: "Most recent" }, { value: "uses", label: "Most used" }, { value: "name", label: "Name A–Z" },
  { value: "spent", label: "Most spent" }, { value: "priceHigh", label: "Price, high to low" }, { value: "priceLow", label: "Price, low to high" },
];

/** Filters are remembered on this device, so the page opens the way it was left. */
const KEY = "nitrolog.parts.filters";
function remembered(): { vehicle: string; kind: Kind; show: Show; sort: Sort } {
  const d = { vehicle: "", kind: "all" as Kind, show: "all" as Show, sort: "recent" as Sort };
  try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return d; }
}

const titleOf = (p: UsedPart) => [p.brand, p.name].filter(Boolean).join(" ");

/** Parts and fluids from past service records: what you used, how often, on what, what it cost, and where it came from. */
export default function UsedTab({ vehicles, currency }: { vehicles: Vehicle[] | undefined; currency: string }) {
  const { data, error } = useApi<UsedPart[]>("/api/parts/used");
  const { data: watches, reload: reloadWatches } = useApi<PriceWatch[]>("/api/price-watches");
  const [search, setSearch] = useState("");
  const [f, setF] = useState(remembered);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* private mode */ } }, [f]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  const money = (c: number) => fmtMoney(c, currency);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <div className="loading">Loading…</div>;
  if (data.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon"><Icon name="wrench" size={36} /></div>
        <div className="empty-state-title">No parts used yet</div>
        <p className="empty-state-desc">Every part and fluid you log on a service record shows up here, with what you paid and where you bought it.</p>
        <Link className="btn-primary" href="/service/new">Log service</Link>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const watched = (p: UsedPart) => !!watchFor(watches, p.url)?.enabled;
  const shown = data.filter(p =>
    (!q || [p.name, p.brand, p.partNumber, ...p.vehicles.map(v => v.name)].some(x => x?.toLowerCase().includes(q)))
    && (!f.vehicle || p.vehicles.some(v => String(v.id) === f.vehicle))
    && (f.kind === "all" || p.kind === f.kind)
    && (f.show === "all" || (f.show === "watched" ? watched(p) : !!p.url)));
  const price = (p: UsedPart) => p.lastUnitCents ?? -1;
  const sorted = [...shown].sort((a, b) => {
    switch (f.sort) {
      case "uses": return b.uses - a.uses || b.lastDate.localeCompare(a.lastDate);
      case "name": return titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: "base" });
      case "spent": return b.spentCents - a.spentCents;
      case "priceHigh": return price(b) - price(a);
      case "priceLow": return (a.lastUnitCents ?? Infinity) - (b.lastUnitCents ?? Infinity);
      default: return b.lastDate.localeCompare(a.lastDate);
    }
  });
  const groups = (f.kind === "all" ? (["part", "fluid"] as const) : [f.kind]).map(k => ({ kind: k, items: sorted.filter(p => p.kind === k) })).filter(g => g.items.length);
  const spent = shown.reduce((s, p) => s + p.spentCents, 0);
  const filtered = !!(q || f.vehicle || f.kind !== "all" || f.show !== "all");

  return (
    <div>
      <input className="form-input" type="search" placeholder="Search by name, brand, part number or vehicle" aria-label="Search parts you've used"
        value={search} onChange={e => setSearch(e.target.value)} />
      <div className="parts-filters">
        <select className="form-select" aria-label="Vehicle" value={f.vehicle} onChange={e => set("vehicle", e.target.value)}>
          <option value="">All vehicles</option>
          {(vehicles ?? []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select className="form-select" aria-label="Parts or fluids" value={f.kind} onChange={e => set("kind", e.target.value as Kind)}>
          <option value="all">Parts and fluids</option><option value="part">Parts only</option><option value="fluid">Fluids only</option>
        </select>
        <select className="form-select" aria-label="Show" value={f.show} onChange={e => set("show", e.target.value as Show)}>
          <option value="all">Everything</option><option value="watched">Watching the price</option><option value="linked">Has a store link</option>
        </select>
        <select className="form-select" aria-label="Sort by" value={f.sort} onChange={e => set("sort", e.target.value as Sort)}>
          {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <p className="parts-summary">
        {shown.length} of {data.length} · {money(spent)} spent{filtered && <> · <button type="button" className="link-btn" onClick={() => { setSearch(""); setF({ vehicle: "", kind: "all", show: "all", sort: f.sort }); }}>Clear filters</button></>}
      </p>
      {groups.length === 0 && <p className="settings-hint section">Nothing matches. Try clearing the filters.</p>}
      {groups.map(g => (
        <section key={g.kind} className="section">
          <div className="section-header"><h2 className="section-title">{g.kind === "fluid" ? "Fluids" : "Parts"} <span className="row-sub">{g.items.length}</span></h2></div>
          <div className="row-list">
            {g.items.map(p => (
              <div key={p.key} className="row-card used-part" data-part={p.name}>
                <div className="row-top">
                  <span className="row-title">{titleOf(p)}</span>
                  {p.lastUnitCents !== null && <span className="used-price">{money(p.lastUnitCents)}<small>{p.kind === "fluid" ? " last time" : " each"}</small></span>}
                </div>
                <div className="row-stats">
                  {p.partNumber && <span>#{p.partNumber}</span>}
                  <span>Used {p.uses === 1 ? "once" : `${p.uses} times`}</span>
                  <span>Last {fmtDate(p.lastDate)}</span>
                  {p.uses > 1 && p.spentCents > 0 && <span>{money(p.spentCents)} total</span>}
                  {p.onHand !== null && <span className="badge badge-green">{p.onHand} on the shelf</span>}
                </div>
                <p className="row-sub used-vehicles">On {p.vehicles.map(v => v.name).join(", ")}</p>
                <div className="used-actions">
                  {p.url ? (
                    <>
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-cyan"><Icon name="link" size={13} /> Store page</a>
                      <WatchButton showPrices url={p.url} name={titleOf(p)} priceCents={p.kind === "fluid" ? null : p.lastUnitCents} watches={watches} onChange={reloadWatches} />
                    </>
                  ) : <span className="form-hint">No store link saved, so its price can&apos;t be watched.</span>}
                  <Link href={`/service/${p.lastServiceId}`} className="text-cyan used-record">Last record</Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
