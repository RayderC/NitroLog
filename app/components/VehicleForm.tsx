"use client";

import { useMemo, useState } from "react";
import Modal from "@/app/components/Modal";
import { useMe } from "@/app/components/MeContext";
import { api, localDay, parseNum } from "@/lib/client";
import { defaultMeter, KINDS, templateFor, type VehicleKind } from "@/lib/templates";
import type { Vehicle } from "@/lib/types";
import { meterUnit, readingFromInput, type MeterType } from "@/lib/units";

/** Add when `vehicle` is missing, edit otherwise. The meter type and starter schedule only apply when adding. */
export default function VehicleForm({ vehicle, onClose, onDone }: { vehicle?: Vehicle; onClose: () => void; onDone: (id: number) => void }) {
  const { me } = useMe();
  const [kind, setKind] = useState<VehicleKind>(vehicle?.kind ?? "car");
  const [meter, setMeter] = useState<MeterType>(vehicle?.meterType ?? "distance");
  const [f, setF] = useState({
    name: vehicle?.name ?? "",
    year: vehicle?.year?.toString() ?? "",
    make: vehicle?.make ?? "",
    model: vehicle?.model ?? "",
    trim: vehicle?.trim ?? "",
    engine: vehicle?.engine ?? "",
    vin: vehicle?.vin ?? "",
    plate: vehicle?.plate ?? "",
    currency: vehicle?.currency ?? "USD",
    notes: vehicle?.notes ?? "",
    reading: "",
  });
  const [skipped, setSkipped] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [vinState, setVinState] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const template = useMemo(() => (vehicle ? [] : templateFor(kind, meter)), [vehicle, kind, meter]);
  const unit = meterUnit(meter, me.distanceUnit);

  function chooseKind(k: VehicleKind) {
    setKind(k);
    if (!vehicle) setMeter(defaultMeter(k));
  }

  async function decode() {
    setVinState("Looking up…");
    try {
      const d = await api<{ year: number | null; make: string; model: string | null; trim: string | null; engine: string | null }>(`/api/vin/${encodeURIComponent(f.vin.trim())}`);
      setF(p => ({
        ...p,
        year: d.year?.toString() ?? p.year,
        make: d.make ?? p.make,
        model: d.model ?? p.model,
        trim: d.trim ?? p.trim,
        engine: d.engine ?? p.engine,
      }));
      setVinState("Filled in from the VIN. Check it looks right.");
    } catch (x) { setVinState((x as Error).message); }
  }

  async function save() {
    setErr("");
    const reading = parseNum(f.reading);
    if (!vehicle && f.reading.trim() !== "" && reading === null) return setErr("The current reading must be a number");
    setSaving(true);
    const details = {
      name: f.name, kind, year: f.year, make: f.make, model: f.model, trim: f.trim, engine: f.engine,
      vin: f.vin, plate: f.plate, currency: f.currency, notes: f.notes,
    };
    try {
      if (vehicle) {
        await api(`/api/vehicles/${vehicle.id}`, { method: "PATCH", body: details });
        onDone(vehicle.id);
      } else {
        const r = await api<{ id: number }>("/api/vehicles", {
          body: {
            ...details, meterType: meter, today: localDay(),
            reading: reading === null ? null : readingFromInput(reading, meter, me.distanceUnit),
            templates: template.map(t => t.name).filter(n => !skipped.includes(n)),
          },
        });
        onDone(r.id);
      }
    } catch (x) {
      setErr((x as Error).message);
      setSaving(false);
    }
  }

  const footer = <button className="btn-primary" onClick={save} disabled={saving}>{vehicle ? "Save" : "Add vehicle"}</button>;

  return (
    <Modal wide title={vehicle ? `Edit ${vehicle.name}` : "Add a vehicle"} onClose={onClose} footer={footer}>
      <div className="form-stack">
        {err && <p className="form-error">{err}</p>}
        <div className="form-group">
          <label className="form-label" htmlFor="v-kind">Type</label>
          <select id="v-kind" className="form-select" value={kind} onChange={e => chooseKind(e.target.value as VehicleKind)}>
            {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="v-vin">VIN (optional)</label>
          <div className="input-action">
            <input id="v-vin" className="form-input" maxLength={17} autoCapitalize="characters" value={f.vin} onChange={set("vin")} />
            <button type="button" className="btn-secondary btn-sm" onClick={decode} disabled={f.vin.trim().length < 11}>Look up</button>
          </div>
          <p className="form-hint">{vinState || "Lookup uses the free NHTSA database, which mainly covers US-market vehicles."}</p>
        </div>

        <div className="form-grid-3">
          <div className="form-group"><label className="form-label" htmlFor="v-year">Year</label><input id="v-year" className="form-input" inputMode="numeric" value={f.year} onChange={set("year")} /></div>
          <div className="form-group"><label className="form-label" htmlFor="v-make">Make</label><input id="v-make" className="form-input" value={f.make} onChange={set("make")} /></div>
          <div className="form-group"><label className="form-label" htmlFor="v-model">Model</label><input id="v-model" className="form-input" value={f.model} onChange={set("model")} /></div>
        </div>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label" htmlFor="v-trim">Trim</label><input id="v-trim" className="form-input" value={f.trim} onChange={set("trim")} /></div>
          <div className="form-group"><label className="form-label" htmlFor="v-engine">Engine</label><input id="v-engine" className="form-input" value={f.engine} onChange={set("engine")} /></div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="v-name">Nickname (optional)</label>
          <input id="v-name" className="form-input" placeholder={[f.year, f.make, f.model].filter(Boolean).join(" ") || "Defaults to year, make and model"} value={f.name} onChange={set("name")} />
        </div>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label" htmlFor="v-plate">Plate</label><input id="v-plate" className="form-input" value={f.plate} onChange={set("plate")} /></div>
          <div className="form-group">
            <label className="form-label" htmlFor="v-currency">Currency</label>
            <input id="v-currency" className="form-input" maxLength={3} autoCapitalize="characters" value={f.currency} onChange={set("currency")} />
          </div>
        </div>

        {!vehicle && (
          <>
            <div className="form-grid-2">
              <div className="form-group">
                <span className="form-label">Tracked by</span>
                <div className="seg">
                  <button type="button" className={meter === "distance" ? "on" : ""} onClick={() => setMeter("distance")}>{me.distanceUnit}</button>
                  <button type="button" className={meter === "hours" ? "on" : ""} onClick={() => setMeter("hours")}>Hours</button>
                </div>
                <p className="form-hint">This can't be changed later.</p>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="v-reading">Current reading ({unit})</label>
                <input id="v-reading" className="form-input" inputMode="decimal" value={f.reading} onChange={set("reading")} />
              </div>
            </div>
            {template.length > 0 && (
              <div className="form-group">
                <span className="form-label">Starter schedule</span>
                <p className="form-hint">Generic intervals to get you started, not factory data. Check your owner's manual and adjust them. Each one starts counting from today unless you edit its last-done date.</p>
                <div className="check-list">
                  {template.map(t => (
                    <label key={t.name} className="check-row">
                      <input type="checkbox" checked={!skipped.includes(t.name)}
                        onChange={e => setSkipped(e.target.checked ? skipped.filter(n => n !== t.name) : [...skipped, t.name])} />
                      {t.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="v-notes">Notes</label>
          <textarea id="v-notes" className="form-textarea" rows={3} value={f.notes} onChange={set("notes")} />
        </div>
      </div>
    </Modal>
  );
}
