"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AttachmentList from "@/app/components/AttachmentList";
import Icon from "@/app/components/Icon";
import { useMe } from "@/app/components/MeContext";
import PartNameInput from "@/app/components/PartNameInput";
import PriceCheck from "@/app/components/PriceCheck";
import { api, fmtDate, localDay, parseNum, useApi } from "@/lib/client";
import { SERVICE_CATEGORIES, type InventoryItem, type PartSuggestion, type PartsHistory, type ScheduleItem, type ServiceDetail, type ServiceItem, type Vehicle } from "@/lib/types";
import { fmtMoney, meterUnit, readingFromInput, readingToInput, toCents } from "@/lib/units";

/** `unitCents` is the price of one, kept so the line total follows the quantity until someone types their own total. */
type PartRow = { kind: "part" | "fluid"; name: string; partNumber: string; brand: string; quantity: string; unit: string; cost: string; inventoryId: number | null; unitCents: number | null };

const blankPart = (kind: PartRow["kind"]): PartRow => ({ kind, name: "", partNumber: "", brand: "", quantity: "1", unit: kind === "fluid" ? "qt" : "", cost: "", inventoryId: null, unitCents: null });

const UNITS = ["ea", "qt", "L", "gal", "oz", "ml", "pair", "set", "ft"];

const partKey = (p: { kind: string; name: string; partNumber: string | null; brand: string | null }) =>
  [p.kind, p.name.trim().toLowerCase(), (p.partNumber ?? "").trim().toLowerCase(), (p.brand ?? "").trim().toLowerCase()].join("|");

/** A line from a past record, priced the same way it was then. */
function rowFromItem(i: ServiceItem): PartRow {
  const unitCents = i.costCents ? Math.round(i.costCents / (i.quantity && i.quantity > 0 ? i.quantity : 1)) : null;
  return {
    kind: i.kind, name: i.name, partNumber: i.partNumber ?? "", brand: i.brand ?? "", quantity: i.quantity?.toString() ?? "1",
    unit: i.unit ?? "", cost: i.costCents ? (i.costCents / 100).toFixed(2) : "", inventoryId: null, unitCents,
  };
}

/** New record when `serviceId` is missing. `initialVehicle` and `initialSchedule` come from "Log it" links. */
export default function ServiceForm({ serviceId, initialVehicle, initialSchedule }: { serviceId?: number; initialVehicle?: number; initialSchedule?: number }) {
  const { me } = useMe();
  const router = useRouter();
  const { data: vehicles } = useApi<Vehicle[]>("/api/vehicles");
  const { data: existing, error: loadError } = useApi<ServiceDetail>(serviceId ? `/api/service/${serviceId}` : null);
  const { data: inventory } = useApi<InventoryItem[]>("/api/inventory");

  const [vehicleId, setVehicleId] = useState<number | null>(initialVehicle ?? null);
  const [date, setDate] = useState(localDay());
  const [reading, setReading] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("maintenance");
  const [laborHours, setLaborHours] = useState("");
  const [laborCost, setLaborCost] = useState("");
  const [notes, setNotes] = useState("");
  const [parts, setParts] = useState<PartRow[]>([]);
  const [tasks, setTasks] = useState<number[]>(initialSchedule ? [initialSchedule] : []);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const vehicle = vehicles?.find(v => v.id === vehicleId);
  const { data: schedule } = useApi<ScheduleItem[]>(vehicleId ? `/api/vehicles/${vehicleId}/schedule?today=${localDay()}` : null);
  const { data: history } = useApi<PartsHistory>(vehicleId ? `/api/vehicles/${vehicleId}/parts-history` : null);
  const [usedLastTime, setUsedLastTime] = useState<number[]>([]);

  // Copy an existing record into the form once, after both it and its vehicle have loaded.
  useEffect(() => {
    if (!existing || !vehicles || loaded) return;
    const v = vehicles.find(x => x.id === existing.vehicleId);
    if (!v) return;
    setVehicleId(existing.vehicleId);
    setDate(existing.date);
    setReading(existing.reading === null ? "" : String(readingToInput(existing.reading, v.meterType, me.distanceUnit)));
    setTitle(existing.title);
    setCategory(existing.category);
    setLaborHours(existing.laborHours?.toString() ?? "");
    setLaborCost(existing.laborCostCents ? (existing.laborCostCents / 100).toFixed(2) : "");
    setNotes(existing.notes ?? "");
    setParts(existing.items.map(i => ({ ...rowFromItem(i), quantity: i.quantity?.toString() ?? "", inventoryId: i.inventoryId })));
    setTasks(existing.scheduleIds);
    setLoaded(true);
  }, [existing, vehicles, loaded, me.distanceUnit]);

  // On a new record, start the reading from the vehicle's current one.
  useEffect(() => {
    if (serviceId || !vehicle) return;
    setReading(vehicle.reading === null ? "" : String(readingToInput(vehicle.reading, vehicle.meterType, me.distanceUnit)));
  }, [serviceId, vehicle?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const readOnly = !!vehicle && vehicle.role === "viewer";
  const taskNames = (schedule ?? []).filter(s => tasks.includes(s.id)).map(s => s.name);
  const effectiveTitle = title.trim() || taskNames.join(", ");
  const editable = vehicles?.filter(v => v.role !== "viewer" && !v.archived) ?? [];
  const money = (s: string) => (s.trim() === "" ? 0 : toCents(parseNum(s) ?? 0));
  const total = money(laborCost) + parts.reduce((sum, p) => sum + money(p.cost), 0);

  const updatePart = (i: number, change: Partial<PartRow>) => setParts(ps => ps.map((p, n) => {
    if (n !== i) return p;
    const next = { ...p, ...change };
    // Typing a total yourself stops it following the quantity.
    if ("cost" in change) next.unitCents = null;
    const qty = parseNum(next.quantity);
    if (next.unitCents !== null && ("quantity" in change || "unitCents" in change)) {
      next.cost = ((next.unitCents * (qty !== null && qty > 0 ? qty : 1)) / 100).toFixed(2);
    }
    return next;
  }));
  const setPart = (i: number, k: keyof PartRow) => (e: React.ChangeEvent<HTMLInputElement>) => updatePart(i, { [k]: e.target.value });

  /** Fill a line from a suggestion, keeping a quantity that's already been typed. */
  function pickPart(i: number, s: PartSuggestion) {
    const cur = parts[i];
    const quantity = cur.quantity.trim() && cur.quantity.trim() !== "1" ? cur.quantity : String(s.quantity ?? 1);
    updatePart(i, {
      name: s.name, partNumber: s.partNumber ?? "", brand: s.brand ?? "", unit: s.unit ?? cur.unit, quantity,
      inventoryId: s.inventoryId, unitCents: s.unitCostCents,
    });
  }

  function addFromStock(id: number) {
    const s = inventory?.find(x => x.id === id);
    if (!s) return;
    setParts([...parts, {
      kind: "part", name: s.name, partNumber: s.partNumber ?? "", brand: s.brand ?? "", quantity: "1", unit: s.unit ?? "",
      cost: s.unitCostCents ? (s.unitCostCents / 100).toFixed(2) : "", inventoryId: s.id, unitCents: s.unitCostCents || null,
    }]);
  }

  // Ticking a schedule item offers the parts from the last time it was done on this vehicle.
  const lastTimeOffers = tasks.flatMap(id => {
    const last = history?.lastByTask[id];
    if (!last || last.serviceId === serviceId || usedLastTime.includes(id)) return [];
    const have = new Set(parts.map(partKey));
    const items = last.items.filter(i => !have.has(partKey(i)));
    if (!items.length) return [];
    return [{ id, name: schedule?.find(s => s.id === id)?.name ?? "this", date: last.date, items }];
  });

  function applyLastTime(offer: { id: number; items: ServiceItem[] }) {
    // Blank lines go, so the copied ones don't sit under empty ones.
    setParts([...parts.filter(p => p.name.trim() !== ""), ...offer.items.map(rowFromItem)]);
    setUsedLastTime([...usedLastTime, offer.id]);
  }

  function checkedNumber(s: string, label: string): number | null {
    if (s.trim() === "") return null;
    const n = parseNum(s);
    if (n === null) throw new Error(`${label} must be a number`);
    return n;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicle) return;
    setErr("");
    setSaving(true);
    try {
      const r = checkedNumber(reading, "Reading");
      const body = {
        date, title: effectiveTitle, category, notes,
        reading: r === null ? null : readingFromInput(r, vehicle.meterType, me.distanceUnit),
        laborHours: checkedNumber(laborHours, "Labor hours"),
        laborCostCents: toCents(checkedNumber(laborCost, "Labor cost") ?? 0),
        scheduleIds: tasks,
        items: parts.map(p => ({
          kind: p.kind, name: p.name, partNumber: p.partNumber, brand: p.brand, unit: p.unit, inventoryId: p.inventoryId,
          quantity: checkedNumber(p.quantity, `Quantity for ${p.name || "a part"}`),
          costCents: toCents(checkedNumber(p.cost, `Cost for ${p.name || "a part"}`) ?? 0),
        })),
      };
      if (serviceId) await api(`/api/service/${serviceId}`, { method: "PATCH", body });
      else await api(`/api/vehicles/${vehicle.id}/service`, { body });
      router.push(`/vehicles/${vehicle.id}?tab=service`);
    } catch (x) {
      setErr((x as Error).message);
      setSaving(false);
    }
  }

  async function remove() {
    if (!serviceId || !vehicle || !confirm("Delete this service record? Any schedule items it reset go back to their previous last-done point.")) return;
    try {
      await api(`/api/service/${serviceId}`, { method: "DELETE" });
      router.push(`/vehicles/${vehicle.id}?tab=service`);
    } catch (x) { setErr((x as Error).message); }
  }

  if (loadError) return <div className="page page-narrow"><p className="form-error">{loadError}</p></div>;
  if (!vehicles || (serviceId && !loaded)) return <div className="loading">Loading…</div>;

  if (!serviceId && editable.length === 0) {
    return (
      <div className="page page-narrow">
        <div className="empty-state">
          <div className="empty-state-title">Add a vehicle first</div>
          <p className="empty-state-desc">You need a vehicle you can edit before you can log service.</p>
          <Link className="btn-primary" href="/vehicles">Go to garage</Link>
        </div>
      </div>
    );
  }

  const unit = vehicle ? meterUnit(vehicle.meterType, me.distanceUnit) : "";
  const currency = vehicle?.currency ?? "USD";

  return (
    <div className="page page-narrow">
      {vehicle && <Link href={`/vehicles/${vehicle.id}?tab=service`} className="back-link"><Icon name="back" size={14} /> {vehicle.name}</Link>}
      <div className="dash-header"><div><h1 className="dash-title">{serviceId ? (readOnly ? "Service record" : "Edit service") : "Log service"}</h1>
        {existing?.loggedBy && <p className="dash-subtitle">Logged by {existing.loggedBy}</p>}</div></div>

      <form onSubmit={save}>
        <fieldset disabled={readOnly} className="plain-fieldset">
          {err && <p className="form-error" style={{ marginBottom: 12 }}>{err}</p>}
          <div className="card section form-stack">
            {!serviceId && (
              <div className="form-group">
                <label className="form-label" htmlFor="sv-vehicle">Vehicle</label>
                <select id="sv-vehicle" className="form-select" required value={vehicleId ?? ""} onChange={e => { setVehicleId(Number(e.target.value) || null); setTasks([]); }}>
                  <option value="">Choose a vehicle…</option>
                  {editable.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            )}
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label" htmlFor="sv-date">Date</label><input id="sv-date" type="date" className="form-input" required value={date} onChange={e => setDate(e.target.value)} /></div>
              <div className="form-group"><label className="form-label" htmlFor="sv-read">Reading{unit ? ` (${unit})` : ""}</label><input id="sv-read" className="form-input" inputMode="decimal" value={reading} onChange={e => setReading(e.target.value)} /></div>
            </div>
            {schedule && schedule.length > 0 && (
              <div className="form-group">
                <span className="form-label">Schedule items this covers</span>
                <p className="form-hint">Checked items count as done on this date.</p>
                <div className="check-list">
                  {schedule.map(s => (
                    <label key={s.id} className="check-row">
                      <input type="checkbox" checked={tasks.includes(s.id)} onChange={e => setTasks(e.target.checked ? [...tasks, s.id] : tasks.filter(t => t !== s.id))} />
                      {s.name}
                      <span className="row-sub"> last {fmtDate(s.lastDate)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="form-group">
              <label className="form-label" htmlFor="sv-title">Title</label>
              <input id="sv-title" className="form-input" maxLength={160} placeholder={taskNames.join(", ") || "e.g. Replaced front pads"} value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="sv-cat">Category</label>
              <select id="sv-cat" className="form-select capitalize" value={category} onChange={e => setCategory(e.target.value)}>
                {SERVICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <section className="section">
            <div className="section-header"><h2 className="section-title">Parts &amp; fluids</h2></div>
            {!readOnly && lastTimeOffers.map(o => (
              <div key={o.id} className="last-time">
                <div>
                  <b>Same as last time?</b>
                  <p className="form-hint">{o.name} on {fmtDate(o.date)}: {o.items.map(i => i.name).join(", ")}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setUsedLastTime([...usedLastTime, o.id])}>No</button>
                  <button type="button" className="btn-primary btn-sm" onClick={() => applyLastTime(o)}>Add {o.items.length === 1 ? "it" : `all ${o.items.length}`}</button>
                </div>
              </div>
            ))}
            <datalist id="part-units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
            <div className="row-list">
              {parts.map((p, i) => (
                <div key={i} className="row-card part-row">
                  <div className="part-head">
                    <span className="flex gap-2">
                      <span className={`badge ${p.kind === "fluid" ? "badge-cyan" : "badge-purple"}`}>{p.kind}</span>
                      {p.inventoryId !== null && <span className="badge badge-green">From stock</span>}
                    </span>
                    {!readOnly && <button type="button" className="icon-btn" aria-label={`Remove ${p.name || p.kind}`} onClick={() => setParts(parts.filter((_, n) => n !== i))}><Icon name="x" size={15} /></button>}
                  </div>
                  <div className="form-stack">
                    <PartNameInput value={p.name} kind={p.kind} parts={readOnly ? [] : history?.parts ?? []} currency={currency}
                      onChange={v => updatePart(i, { name: v })} onPick={s => pickPart(i, s)} />
                    <div className="form-grid-2">
                      <input className="form-input" placeholder="Part number" aria-label="Part number" value={p.partNumber} onChange={setPart(i, "partNumber")} />
                      <input className="form-input" placeholder="Brand" aria-label="Brand" value={p.brand} onChange={setPart(i, "brand")} />
                    </div>
                    <div className="part-nums">
                      <label className="part-num"><span>Qty</span><input className="form-input" inputMode="decimal" aria-label="Quantity" value={p.quantity} onChange={setPart(i, "quantity")} /></label>
                      <label className="part-num"><span>Unit</span><input className="form-input" list="part-units" aria-label="Unit" value={p.unit} onChange={setPart(i, "unit")} /></label>
                      <label className="part-num"><span>Total {currency}</span><input className="form-input" inputMode="decimal" aria-label={`Total cost in ${currency}`} value={p.cost} onChange={setPart(i, "cost")} /></label>
                    </div>
                    {p.unitCents !== null && parseNum(p.quantity) !== null && parseNum(p.quantity) !== 1 && (
                      <p className="form-hint">{fmtMoney(p.unitCents, currency)} each</p>
                    )}
                    {!readOnly && vehicle && <PriceCheck part={p} vehicle={vehicle} onUse={c => updatePart(i, { unitCents: c })} />}
                  </div>
                </div>
              ))}
            </div>
            {!readOnly && (
              <div className="flex gap-2" style={{ marginTop: 10 }}>
                <button type="button" className="add-set-btn" onClick={() => setParts([...parts, blankPart("part")])}><Icon name="plus" size={14} /> Part</button>
                <button type="button" className="add-set-btn" onClick={() => setParts([...parts, blankPart("fluid")])}><Icon name="plus" size={14} /> Fluid</button>
              </div>
            )}
            {!readOnly && !!inventory?.length && (
              <select className="form-select stock-picker" aria-label="Add a part from your inventory" value="" onChange={e => addFromStock(Number(e.target.value))}>
                <option value="">Use a part from your inventory…</option>
                {inventory.map(s => <option key={s.id} value={s.id}>{s.name}{s.partNumber ? ` (${s.partNumber})` : ""}: {s.quantity} on hand</option>)}
              </select>
            )}
          </section>

          <div className="card section form-stack">
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label" htmlFor="sv-lh">Labor hours</label><input id="sv-lh" className="form-input" inputMode="decimal" value={laborHours} onChange={e => setLaborHours(e.target.value)} /></div>
              <div className="form-group"><label className="form-label" htmlFor="sv-lc">Labor cost ({currency})</label><input id="sv-lc" className="form-input" inputMode="decimal" value={laborCost} onChange={e => setLaborCost(e.target.value)} /></div>
            </div>
            <div className="form-group"><label className="form-label" htmlFor="sv-notes">Notes</label><textarea id="sv-notes" className="form-textarea" rows={4} placeholder="Anything worth remembering next time" value={notes} onChange={e => setNotes(e.target.value)} /></div>
            <div className="service-total"><span className="form-label">Total</span><b>{fmtMoney(total, currency)}</b></div>
          </div>

          {!readOnly && (
            <div className="flex gap-2 section justify-between">
              {serviceId ? <button type="button" className="btn-danger" onClick={remove}>Delete</button> : <span />}
              <button className="btn-primary" disabled={saving || !vehicle || !effectiveTitle}>{saving ? "Saving…" : "Save"}</button>
            </div>
          )}
        </fieldset>
      </form>

      {serviceId && vehicle ? (
        <section className="section">
          <div className="section-header"><h2 className="section-title">Receipts &amp; photos</h2></div>
          <AttachmentList vehicleId={vehicle.id} serviceId={serviceId} canEdit={!readOnly} />
        </section>
      ) : <p className="settings-hint section">You can add receipts and photos after saving, by opening the record.</p>}
    </div>
  );
}
