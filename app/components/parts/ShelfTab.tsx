"use client";

import { useState } from "react";
import Icon from "@/app/components/Icon";
import LinkPaste, { type LinkedPart } from "@/app/components/LinkPaste";
import QuickForm, { type Field } from "@/app/components/QuickForm";
import WatchButton from "@/app/components/WatchButton";
import { api, parseNum, useApi } from "@/lib/client";
import type { InventoryItem, PriceWatch, Vehicle } from "@/lib/types";
import { fmtMoney, toCents } from "@/lib/units";

/** The shelf: parts kept in stock, with how many are on hand. Most people won't need it, so it's a second tab. */
export default function ShelfTab({ vehicles, currency }: { vehicles: Vehicle[] | undefined; currency: string }) {
  const { data, error, reload } = useApi<InventoryItem[]>("/api/inventory");
  const [editing, setEditing] = useState<InventoryItem | "new" | null>(null);
  const [search, setSearch] = useState("");
  const { data: watches, reload: reloadWatches } = useApi<PriceWatch[]>("/api/price-watches");

  const q = search.trim().toLowerCase();
  const shown = (data ?? []).filter(i => !q || [i.name, i.partNumber, i.brand, i.location, i.vehicleName].some(x => x?.toLowerCase().includes(q)));
  const low = (i: InventoryItem) => i.minQuantity !== null && i.quantity <= i.minQuantity;

  const fields: Field[] = [
    { key: "name", label: "Name", required: true, placeholder: "Oil filter" },
    { key: "partNumber", label: "Part number" },
    { key: "brand", label: "Brand" },
    { key: "quantity", label: "On hand", type: "number", required: true, hint: "Logging a service with this part takes it out of stock automatically." },
    { key: "unit", label: "Unit", placeholder: "each, qt, L" },
    { key: "unitCost", label: "Cost per unit", type: "number" },
    { key: "minQuantity", label: "Warn when at or below", type: "number" },
    { key: "location", label: "Where it's kept", placeholder: "Shelf 2, blue bin" },
    { key: "url", label: "Store link", type: "url", placeholder: "https://…", hint: "Where you bought it, so you can find it again." },
    { key: "vehicleId", label: "For vehicle", type: "select", options: [{ value: "", label: "Any vehicle" }, ...(vehicles ?? []).map(v => ({ value: String(v.id), label: v.soldOn ? `${v.name} (sold)` : v.name }))] },
    { key: "notes", label: "Notes", type: "textarea" },
  ];

  function number(s: string, label: string): number | null {
    if (!s.trim()) return null;
    const n = parseNum(s);
    if (n === null) throw new Error(`${label} must be a number`);
    return n;
  }

  async function save(x: Record<string, string>) {
    const body = {
      name: x.name, partNumber: x.partNumber, brand: x.brand, unit: x.unit, location: x.location, notes: x.notes, url: x.url,
      vehicleId: x.vehicleId || null,
      quantity: number(x.quantity, "On hand"),
      minQuantity: number(x.minQuantity, "Warn when at or below"),
      unitCostCents: toCents(number(x.unitCost, "Cost per unit") ?? 0),
    };
    if (editing !== "new" && editing) await api(`/api/inventory/${editing.id}`, { method: "PATCH", body });
    else await api("/api/inventory", { body });
    setEditing(null);
    reload();
  }

  const item = editing !== "new" ? editing : null;

  /**
   * A pasted link fills the form. A pack of 12 is 12 on hand, and a 5 qt jug is 5 qt, so the price is split per unit.
   * A quantity already typed is kept.
   */
  function fromLink(fill: (v: Record<string, string>) => void) {
    return (l: LinkedPart, paidCents: number | null) => {
      const cents = paidCents ?? l.priceCents;
      const qty = l.quantity && l.quantity > 0 ? l.quantity : 1;
      fill({
        name: l.name, brand: l.brand ?? "", partNumber: l.partNumber ?? "",
        // A picture usually has no link, and that shouldn't wipe out one already saved.
        ...(l.url ? { url: l.url } : {}),
        ...(l.kind === "fluid" ? { unit: l.unit ?? "qt" } : {}),
        ...(cents !== null ? { unitCost: (cents / qty / 100).toFixed(2) } : {}),
        ...(editing === "new" ? { quantity: String(qty) } : {}),
      });
    };
  }

  return (
    <div>
      <div className="parts-toolbar">
        <p className="settings-hint">Spare parts and fluids you keep around. Logging a service with one takes it out of stock.</p>
        <button className="btn-primary btn-sm" onClick={() => setEditing("new")}><Icon name="plus" size={14} /> Add to shelf</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {!data ? !error && <div className="loading">Loading…</div> : data.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon name="box" size={36} /></div>
          <div className="empty-state-title">Nothing on the shelf yet</div>
          <p className="empty-state-desc">If you keep spares around, add them here and pick them when you log a service. Otherwise you can ignore this tab.</p>
        </div>
      ) : (
        <>
          <input className="form-input section" placeholder="Search the shelf" aria-label="Search the shelf" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="row-list section">
            {shown.map(i => (
              <button key={i.id} className="row-card" onClick={() => setEditing(i)}>
                <div className="row-top">
                  <span className="row-title">{i.name}</span>
                  {low(i) && <span className="badge badge-gold">Low stock</span>}
                </div>
                <div className="row-stats">
                  <span><b>{i.quantity.toLocaleString()}</b> {i.unit ?? "on hand"}</span>
                  {i.partNumber && <span>{i.partNumber}</span>}
                  {i.brand && <span>{i.brand}</span>}
                  {i.unitCostCents > 0 && <span>{fmtMoney(i.unitCostCents, currency)} each</span>}
                  {i.location && <span>{i.location}</span>}
                  {i.vehicleName && <span>For {i.vehicleName}</span>}
                  {i.url && <span><Icon name="link" size={12} /> Link saved</span>}
                </div>
              </button>
            ))}
            {shown.length === 0 && <p className="settings-hint">No parts match that search.</p>}
          </div>
        </>
      )}
      {editing && (
        <QuickForm title={item ? `Edit ${item.name}` : "Add part"} fields={fields} onClose={() => setEditing(null)} onSave={save}
          top={fill => (
            <>
              <LinkPaste onPart={fromLink(fill)} currency={currency} label="Fill in from a link or screenshot" pickOne />
              {item?.url && (
                <div className="part-link">
                  <WatchButton showPrices url={item.url} name={[item.brand, item.name].filter(Boolean).join(" ")} priceCents={item.unitCostCents || null} watches={watches} onChange={reloadWatches} />
                </div>
              )}
            </>
          )}
          initial={{
            name: item?.name ?? "", partNumber: item?.partNumber ?? "", brand: item?.brand ?? "", quantity: item ? String(item.quantity) : "",
            unit: item?.unit ?? "", unitCost: item?.unitCostCents ? (item.unitCostCents / 100).toFixed(2) : "", minQuantity: item?.minQuantity?.toString() ?? "",
            location: item?.location ?? "", vehicleId: item?.vehicleId?.toString() ?? "", notes: item?.notes ?? "", url: item?.url ?? "",
          }}
          onDelete={item ? async () => { await api(`/api/inventory/${item.id}`, { method: "DELETE" }); setEditing(null); reload(); } : undefined}
          deleteConfirm="Delete this part? Service records that used it keep their details." />
      )}
    </div>
  );
}
