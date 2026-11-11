"use client";

import Link from "next/link";
import { useState } from "react";
import { useMe } from "@/app/components/MeContext";
import { api } from "@/lib/client";
import type { Vehicle } from "@/lib/types";
import { fmtMoney } from "@/lib/units";

type PriceLookup = {
  enabled: boolean;
  query: string;
  results: { title: string; priceCents: number; currency: string; condition: string | null; url: string; fits: boolean }[];
  medianCents: number | null;
  lowCents: number | null;
  highCents: number | null;
};

/** What to search for: the part number when there is one, since it's exact; otherwise the name. */
export function searchText(p: { name: string; partNumber: string; brand: string }) {
  return [p.brand, p.partNumber || p.name].map(s => s.trim()).filter(Boolean).join(" ");
}

/** Store searches that open in a new tab. They work without any keys. */
function storeLinks(p: { name: string; partNumber: string; brand: string }, v: Vehicle) {
  const ymm = [v.year, v.make, v.model].filter(Boolean).join(" ");
  const q = searchText(p);
  // Without a part number, add the vehicle so the stores show parts that fit it.
  const full = p.partNumber.trim() ? q : `${ymm} ${q}`.trim();
  const e = encodeURIComponent;
  const rock = p.partNumber.trim()
    ? `https://www.rockauto.com/en/partsearch/?partnum=${e(p.partNumber.trim())}`
    : v.year && v.make && v.model
      ? `https://www.rockauto.com/en/catalog/${e(v.make.toLowerCase())},${v.year},${e(v.model.toLowerCase())}`
      : "https://www.rockauto.com/";
  return [
    { label: "RockAuto", href: rock },
    { label: "AutoZone", href: `https://www.autozone.com/searchresult?searchText=${e(full)}` },
    { label: "Amazon", href: `https://www.amazon.com/s?k=${e(full)}` },
    { label: "Google", href: `https://www.google.com/search?tbm=shop&q=${e(full)}` },
  ];
}

/** "Prices" on a part line: eBay listings for the part, and links to search the big stores. */
export default function PriceCheck({ part, vehicle, onUse }: {
  part: { name: string; partNumber: string; brand: string };
  vehicle: Vehicle;
  onUse: (unitCents: number) => void;
}) {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PriceLookup | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const q = searchText(part);

  async function load() {
    setOpen(true);
    if (data?.query === q) return;
    setErr(""); setLoading(true);
    try { setData(await api<PriceLookup>(`/api/vehicles/${vehicle.id}/prices?q=${encodeURIComponent(q)}`)); }
    catch (x) { setErr((x as Error).message); }
    finally { setLoading(false); }
  }

  if (!q) return null;
  if (!open) return <button type="button" className="link-btn price-toggle" onClick={load}>Check prices</button>;

  return (
    <div className="price-panel">
      <div className="price-panel-head">
        <span className="form-label">Prices for {q}</span>
        <button type="button" className="link-btn" onClick={() => setOpen(false)}>Hide</button>
      </div>
      {loading && <p className="form-hint">Looking on eBay…</p>}
      {err && <p className="form-error">{err}</p>}
      {data && !data.enabled && (
        <p className="form-hint">
          {me.isAdmin
            ? <>eBay prices are off. <Link href="/admin" className="text-cyan">Set them up on the Admin page</Link> with free eBay keys; there&apos;s a step-by-step guide.</>
            : "eBay prices are off. Ask your admin to set them up."}
          {" "}The store links below work anyway.
        </p>
      )}
      {data?.enabled && !loading && data.results.length === 0 && <p className="form-hint">eBay has no listings for that. Try the part number, or the stores below.</p>}
      {data?.enabled && data.results.length > 0 && data.medianCents !== null && (
        <>
          <div className="price-summary">
            <span>eBay: <b>{fmtMoney(data.lowCents!, "USD")}</b> to <b>{fmtMoney(data.highCents!, "USD")}</b>, typical <b>{fmtMoney(data.medianCents, "USD")}</b></span>
            <button type="button" className="btn-secondary btn-sm" onClick={() => onUse(data.medianCents!)}>Use {fmtMoney(data.medianCents, "USD")}</button>
          </div>
          <ul className="price-list">
            {data.results.map(r => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="price-title">{r.title}</a>
                <span className="price-meta">{r.condition}{r.fits ? " · fits your vehicle" : ""}</span>
                <button type="button" className="link-btn" onClick={() => onUse(r.priceCents)}>Use {fmtMoney(r.priceCents, r.currency)}</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="price-stores">
        {storeLinks(part, vehicle).map(l => <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>)}
      </div>
    </div>
  );
}
