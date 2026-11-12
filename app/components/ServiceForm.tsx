"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AttachmentList from "@/app/components/AttachmentList";
import Icon from "@/app/components/Icon";
import { useMe } from "@/app/components/MeContext";
import LinkPaste, { type LinkedPart } from "@/app/components/LinkPaste";
import PartNameInput from "@/app/components/PartNameInput";
import PriceCheck from "@/app/components/PriceCheck";
import WatchButton from "@/app/components/WatchButton";
import { api, fmtDate, localDay, parseNum, useApi } from "@/lib/client";
import { parseProductTitle, priceToCents } from "@/lib/partText";
import { SERVICE_CATEGORIES, type InventoryItem, type PartSuggestion, type PartsHistory, type PriceWatch, type ScheduleItem, type ServiceDetail, type ServiceItem, type Vehicle } from "@/lib/types";
import { fmtMoney, meterUnit, readingFromInput, readingToInput, toCents } from "@/lib/units";

/** `unitCents` is the price of one, kept so the line total follows the quantity until someone types their own total. */
type PartRow = { kind: "part" | "fluid"; name: string; partNumber: string; brand: string; quantity: string; unit: string; cost: string; inventoryId: number | null; unitCents: number | null; url: string };

const blankPart = (kind: PartRow["kind"]): PartRow => ({ kind, name: "", partNumber: "", brand: "", quantity: "1", unit: kind === "fluid" ? "qt" : "", cost: "", inventoryId: null, unitCents: null, url: "" });

/** Only http and https links are shown as links. The server checks the same when saving. */
const safeLink = (s: string | null | undefined) => (s && /^https?:\/\//i.test(s) ? s : "");

const UNITS = ["ea", "qt", "L", "gal", "oz", "ml", "pair", "set", "ft"];

const partKey = (p: { kind: string; name: string; partNumber: string | null; brand: string | null }) =>
  [p.kind, p.name.trim().toLowerCase(), (p.partNumber ?? "").trim().toLowerCase(), (p.brand ?? "").trim().toLowerCase()].join("|");

/** A line from a past record, priced the same way it was then. */
function rowFromItem(i: ServiceItem): PartRow {
  const unitCents = i.costCents ? Math.round(i.costCents / (i.quantity && i.quantity > 0 ? i.quantity : 1)) : null;
  return {
    kind: i.kind, name: i.name, partNumber: i.partNumber ?? "", brand: i.brand ?? "", quantity: i.quantity?.toString() ?? "1",
    unit: i.unit ?? "", cost: i.costCents ? (i.costCents / 100).toFixed(2) : "", inventoryId: null, unitCents, url: i.url ?? "",
  };
}

/** New record when `serviceId` is missing. `initialVehicle` and `initialSchedule` come from "Log it" links. */
/** What the "Send to NitroLog" bookmark reads off a store page: title, brand, part number, price, address, site. */
type SentPart = { t?: unknown; b?: unknown; n?: unknown; p?: unknown; u?: unknown; s?: unknown };

const STORE_NAMES: [RegExp, string][] = [[/amazon\./, "Amazon"], [/autozone\./, "AutoZone"], [/oreillyauto\./, "O'Reilly"], [/advanceautoparts\./, "Advance Auto Parts"], [/napaonline\./, "NAPA"], [/rockauto\./, "RockAuto"], [/walmart\./, "Walmart"]];
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Turns what the bookmark sent into a part line. It only fills form fields, which are checked before saving. */
function rowFromSent(raw: string): { row: PartRow; store: string } | null {
  let d: SentPart;
  try { d = JSON.parse(raw); } catch { return null; }
  const title = text(d.t, 600);
  if (!title) return null;
  // "Visit the K&N Store" and "Brand: K&N" both mean K&N.
  const brand = text(d.b, 80).replace(/^Visit the\s+/i, "").replace(/\s+Store$/i, "").replace(/^Brand:\s*/i, "") || null;
  const t = parseProductTitle(title, brand);
  const host = text(d.s, 100).toLowerCase();
  const store = STORE_NAMES.find(([re]) => re.test(host))?.[1] ?? host.replace(/^www\./, "");
  const paid = priceToCents(text(d.p, 40));
  const qty = t.quantity && t.kind === "fluid" ? t.quantity : 1;
  return {
    store,
    row: {
      kind: t.kind, name: t.name, brand: t.brand ?? "", partNumber: text(d.n, 80) || t.partNumber || "",
      quantity: String(qty), unit: t.kind === "fluid" ? (t.unit ?? "qt") : "",
      // The page's price is the line total. A fluid's quantity is the jug's size, not how many were bought.
      unitCents: t.kind === "fluid" ? null : paid,
      cost: paid !== null ? (paid / 100).toFixed(2) : "",
      inventoryId: null,
      url: safeLink(text(d.u, 2000)),
    },
  };
}

export default function ServiceForm({ serviceId, initialVehicle, initialSchedule, sentPart }: { serviceId?: number; initialVehicle?: number; initialSchedule?: number; sentPart?: string | null }) {
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
  const [sentNote, setSentNote] = useState("");
  const { data: watches, reload: reloadWatches } = useApi<PriceWatch[]>("/api/price-watches");
  // Pictures read for parts, kept as receipts on the record when it's saved.
  const [pictures, setPictures] = useState<File[]>([]);
  const [keepPictures, setKeepPictures] = useState(true);
  // An Upgrade record also goes in the build log, with power before and after.
  const [buildAdd, setBuildAdd] = useState(true);
  const [powerBefore, setPowerBefore] = useState("");
  const [powerAfter, setPowerAfter] = useState("");
  const [powerUnit, setPowerUnit] = useState<"whp" | "hp">("whp");
  const [buildNote, setBuildNote] = useState("");

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
    // An older upgrade record without a build log entry stays without one unless it's ticked.
    setBuildAdd(!!existing.build);
    setPowerBefore(existing.build?.powerBefore?.toString() ?? "");
    setPowerAfter(existing.build?.powerAfter?.toString() ?? "");
    setPowerUnit(existing.build?.powerUnit ?? "whp");
    setBuildNote(existing.build?.note ?? "");
    setLaborHours(existing.laborHours?.toString() ?? "");
    setLaborCost(existing.laborCostCents ? (existing.laborCostCents / 100).toFixed(2) : "");
    setNotes(existing.notes ?? "");
    setParts(existing.items.map(i => ({ ...rowFromItem(i), quantity: i.quantity?.toString() ?? "", inventoryId: i.inventoryId })));
    setTasks(existing.scheduleIds);
    setLoaded(true);
  }, [existing, vehicles, loaded, me.distanceUnit]);

  // A part sent by the "Send to NitroLog" bookmark goes in once, and leaves the address so a reload doesn't add it again.
  useEffect(() => {
    if (!sentPart || serviceId) return;
    const got = rowFromSent(sentPart);
    if (got) {
      setParts(ps => [...ps, got.row]);
      setSentNote(`Added from ${got.store}${got.row.cost ? `, at $${got.row.cost}` : " (no price found on that page, so type it)"}. Check the details and save.`);
    } else setSentNote("The store page didn't send anything NitroLog could read. Add the part by hand.");
    window.history.replaceState(null, "", window.location.pathname + (initialVehicle ? `?vehicle=${initialVehicle}` : ""));
  }, [sentPart]); // eslint-disable-line react-hooks/exhaustive-deps

  // With only one vehicle to log against, choose it.
  useEffect(() => {
    if (serviceId || vehicleId !== null || !vehicles) return;
    const ok = vehicles.filter(v => v.role !== "viewer" && !v.archived);
    if (ok.length === 1) setVehicleId(ok[0].id);
  }, [vehicles, serviceId, vehicleId]);

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
      inventoryId: s.inventoryId, unitCents: s.unitCostCents, url: cur.url || (s.url ?? ""),
    });
  }

  function addFromStock(id: number) {
    const s = inventory?.find(x => x.id === id);
    if (!s) return;
    setParts([...parts, {
      kind: "part", name: s.name, partNumber: s.partNumber ?? "", brand: s.brand ?? "", quantity: "1", unit: s.unit ?? "",
      cost: s.unitCostCents ? (s.unitCostCents / 100).toFixed(2) : "", inventoryId: s.id, unitCents: s.unitCostCents || null, url: s.url ?? "",
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

  /** A part read from a store link, with the price typed beside it, goes into an empty line if there is one. */
  function addFromLink(l: LinkedPart, paidCents: number | null) {
    const qty = l.quantity && l.quantity > 0 ? l.quantity : 1;
    // The price typed beside the link wins over the store's price. Either is the line's total.
    const cents = paidCents ?? l.priceCents;
    const row: PartRow = {
      ...blankPart(l.kind), name: l.name, brand: l.brand ?? "", partNumber: l.partNumber ?? "",
      quantity: String(qty), unit: l.kind === "fluid" ? (l.unit ?? "qt") : "",
      // A fluid's quantity is the size of the jug, not how many you bought, so it has no price per unit.
      unitCents: cents !== null && l.kind !== "fluid" ? Math.round(cents / qty) : null,
      cost: cents !== null ? (cents / 100).toFixed(2) : "",
      url: l.url,
    };
    // Several can arrive at once from a receipt, so each works on the latest list.
    setParts(ps => {
      const empty = ps.findIndex(x => !x.name.trim() && !x.partNumber.trim());
      return empty >= 0 ? ps.map((x, i) => (i === empty ? { ...row, kind: l.kind, unit: row.unit || x.unit } : x)) : [...ps, row];
    });
  }

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
        build: category === "upgrade" && buildAdd ? {
          add: true, powerUnit, note: buildNote,
          powerBefore: checkedNumber(powerBefore, "Power before"), powerAfter: checkedNumber(powerAfter, "Power after"),
        } : null,
        items: parts.map(p => ({
          kind: p.kind, name: p.name, partNumber: p.partNumber, brand: p.brand, unit: p.unit, inventoryId: p.inventoryId, url: p.url || null,
          quantity: checkedNumber(p.quantity, `Quantity for ${p.name || "a part"}`),
          costCents: toCents(checkedNumber(p.cost, `Cost for ${p.name || "a part"}`) ?? 0),
        })),
      };
      let id = serviceId;
      if (serviceId) await api(`/api/service/${serviceId}`, { method: "PATCH", body });
      else id = (await api<{ id: number }>(`/api/vehicles/${vehicle.id}/service`, { body })).id;
      // The record is saved, so a picture that won't upload is reported but doesn't undo it.
      if (keepPictures && id) {
        for (const pic of pictures) {
          const form = new FormData();
          form.append("file", pic, pic.name || "receipt.jpg");
          form.append("category", "receipt");
          form.append("serviceId", String(id));
          const res = await fetch(`/api/vehicles/${vehicle.id}/attachments`, { method: "POST", body: form });
          if (!res.ok) {
            const m = (await res.json().catch(() => ({})))?.message ?? res.status;
            setErr(`Saved, but the receipt picture didn't upload (${m}). Open the record to add it.`);
            setSaving(false);
            return;
          }
        }
      }
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
                {SERVICE_CATEGORIES.map(c => <option key={c} value={c}>{c === "upgrade" ? "upgrade / mod" : c}</option>)}
              </select>
            </div>
            {category === "upgrade" && (
              <div className="build-box">
                <label className="check-row"><input type="checkbox" checked={buildAdd} onChange={e => setBuildAdd(e.target.checked)} /> Add to the build log</label>
                {buildAdd && (
                  <>
                    <div className="power-row">
                      <label className="part-num"><span>Power before</span><input className="form-input" inputMode="decimal" aria-label="Power before" placeholder="e.g. 420" value={powerBefore} onChange={e => setPowerBefore(e.target.value)} /></label>
                      <label className="part-num"><span>Power after</span><input className="form-input" inputMode="decimal" aria-label="Power after" placeholder="e.g. 485" value={powerAfter} onChange={e => setPowerAfter(e.target.value)} /></label>
                      <label className="part-num"><span>Measured as</span>
                        <select className="form-select" aria-label="Power measured as" value={powerUnit} onChange={e => setPowerUnit(e.target.value as "whp" | "hp")}>
                          <option value="whp">whp (dyno)</option><option value="hp">hp (crank)</option>
                        </select>
                      </label>
                    </div>
                    <textarea className="form-textarea" rows={3} aria-label="Build note" placeholder="How it went, the tune, before and after notes" value={buildNote} onChange={e => setBuildNote(e.target.value)} />
                    <p className="form-hint">Power is optional. The Build tab shows where the car started and where it is now.</p>
                  </>
                )}
              </div>
            )}
          </div>

          <section className="section">
            <div className="section-header"><h2 className="section-title">Parts &amp; fluids</h2></div>
            {sentNote && <p className="sent-note">{sentNote}</p>}
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
                    {safeLink(p.url) && (
                      <div className="part-link">
                        <a href={safeLink(p.url)} target="_blank" rel="noopener noreferrer"><Icon name="link" size={13} /> Open store page</a>
                        {!readOnly && <button type="button" className="link-btn" onClick={() => updatePart(i, { url: "" })}>Remove link</button>}
                        <WatchButton url={safeLink(p.url)} name={[p.brand, p.name].filter(Boolean).join(" ")} watches={watches} onChange={reloadWatches}
                          priceCents={p.unitCents ?? (p.cost.trim() && parseNum(p.quantity) === 1 ? money(p.cost) || null : null)} />
                      </div>
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
            {!readOnly && <LinkPaste onPart={addFromLink} currency={currency} onPicture={f => setPictures(ps => [...ps, f])} />}
            {!readOnly && pictures.length > 0 && (
              <label className="check-row keep-pictures">
                <input type="checkbox" checked={keepPictures} onChange={e => setKeepPictures(e.target.checked)} />
                Save {pictures.length === 1 ? "the picture" : `the ${pictures.length} pictures`} to this record as {pictures.length === 1 ? "a receipt" : "receipts"}
              </label>
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
