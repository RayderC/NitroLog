"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "@/app/components/Icon";
import { useMe } from "@/app/components/MeContext";
import { api, fmtDate, useApi } from "@/lib/client";
import { parseAmount, parseCsv, parseDay, type DateOrder } from "@/lib/csv";
import { SERVICE_CATEGORIES, type Vehicle } from "@/lib/types";
import { readingFromInput, toCents, toLiters, type DistanceUnit, type VolumeUnit } from "@/lib/units";

type Target = "date" | "title" | "reading" | "cost" | "notes" | "category" | "volume";

const TARGETS: Record<"service" | "fuel", { key: Target; label: string; required?: boolean; guess: RegExp }[]> = {
  service: [
    { key: "date", label: "Date", required: true, guess: /date|when/i },
    { key: "title", label: "What was done", required: true, guess: /title|service|work|description|item|task/i },
    { key: "reading", label: "Odometer / hours", guess: /odo|mile|mileage|km|reading|hours/i },
    { key: "cost", label: "Cost", guess: /cost|price|amount|total/i },
    { key: "category", label: "Category", guess: /categor|type/i },
    { key: "notes", label: "Notes", guess: /note|comment|remark/i },
  ],
  fuel: [
    { key: "date", label: "Date", required: true, guess: /date|when/i },
    { key: "volume", label: "Fuel amount", required: true, guess: /gallon|litre|liter|volume|quantity|amount|fuel/i },
    { key: "reading", label: "Odometer / hours", guess: /odo|mile|mileage|km|reading|hours/i },
    { key: "cost", label: "Total cost", guess: /total|cost|price/i },
    { key: "notes", label: "Notes", guess: /note|comment|remark/i },
  ],
};

export default function ImportPage() {
  const { me } = useMe();
  const { data: vehicles } = useApi<Vehicle[]>("/api/vehicles");
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [type, setType] = useState<"service" | "fuel">("service");
  const [map, setMap] = useState<Partial<Record<Target, number>>>({});
  const [order, setOrder] = useState<DateOrder>("mdy");
  const [du, setDu] = useState<DistanceUnit>(me.distanceUnit);
  const [vu, setVu] = useState<VolumeUnit>(me.volumeUnit);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const editable = vehicles?.filter(v => v.role !== "viewer") ?? [];
  const vehicle = editable.find(v => v.id === vehicleId);
  const headers = grid?.[0] ?? [];
  const body = useMemo(() => grid?.slice(1) ?? [], [grid]);

  function guessMap(cols: string[], t: "service" | "fuel") {
    const next: Partial<Record<Target, number>> = {};
    for (const target of TARGETS[t]) {
      const i = cols.findIndex((c, n) => target.guess.test(c) && !Object.values(next).includes(n));
      if (i >= 0) next[target.key] = i;
    }
    return next;
  }

  async function choose(file: File | undefined) {
    setErr(""); setResult(null);
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return setErr("That file is over 20 MB");
    const rows = parseCsv(await file.text());
    if (rows.length < 2) return setErr("That file needs a header row and at least one row of data");
    setGrid(rows);
    setFileName(file.name);
    setMap(guessMap(rows[0], type));
  }

  function chooseType(t: "service" | "fuel") {
    setType(t);
    setResult(null);
    if (grid) setMap(guessMap(grid[0], t));
  }

  const cell = (row: string[], key: Target) => (map[key] === undefined ? "" : (row[map[key]!] ?? "").trim());

  // Works out every row up front so the preview shows exactly what would be saved.
  const parsed = useMemo(() => {
    if (!vehicle) return { rows: [] as object[], problems: [] as string[], preview: [] as { date: string; label: string }[] };
    const rows: object[] = [];
    const preview: { date: string; label: string }[] = [];
    const problems: string[] = [];
    body.forEach((row, n) => {
      const line = n + 2;
      const date = parseDay(cell(row, "date"), order);
      if (!date) return problems.push(`Line ${line}: can't read the date "${cell(row, "date")}"`);
      const rawReading = cell(row, "reading");
      const reading = rawReading ? parseAmount(rawReading) : null;
      if (rawReading && reading === null) return problems.push(`Line ${line}: can't read the reading "${rawReading}"`);
      const stored = reading === null ? null : readingFromInput(reading, vehicle.meterType, du);
      const rawCost = cell(row, "cost");
      const cost = rawCost ? parseAmount(rawCost) : 0;
      if (rawCost && cost === null) return problems.push(`Line ${line}: can't read the cost "${rawCost}"`);
      const costCents = toCents(Math.abs(cost ?? 0));
      const notes = cell(row, "notes");
      if (type === "service") {
        const title = cell(row, "title");
        if (!title) return problems.push(`Line ${line}: nothing in the "what was done" column`);
        const cat = cell(row, "category").toLowerCase();
        rows.push({ date, title, reading: stored, costCents, notes, category: SERVICE_CATEGORIES.includes(cat as never) ? cat : "maintenance" });
        preview.push({ date, label: title });
      } else {
        const volume = parseAmount(cell(row, "volume"));
        if (!volume) return problems.push(`Line ${line}: can't read the fuel amount "${cell(row, "volume")}"`);
        rows.push({ date, reading: stored, costCents, notes, volumeL: toLiters(volume, vu) });
        preview.push({ date, label: `${volume} ${vu}` });
      }
    });
    return { rows, problems, preview };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, map, order, du, vu, type, vehicle]);

  const missing = TARGETS[type].filter(t => t.required && map[t.key] === undefined);
  const dates = parsed.preview.map(p => p.date).sort();

  async function save() {
    if (!vehicle) return;
    setErr(""); setSaving(true);
    try { setResult(await api(`/api/vehicles/${vehicle.id}/import`, { body: { type, rows: parsed.rows } })); setGrid(null); }
    catch (x) { setErr((x as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="page page-narrow">
      <Link href="/settings" className="back-link"><Icon name="back" size={14} /> Settings</Link>
      <div className="dash-header"><div><h1 className="dash-title">Import from CSV</h1><p className="dash-subtitle">Bring in old records from a spreadsheet. Nothing is saved until you confirm.</p></div></div>
      {err && <p className="form-error section">{err}</p>}
      {result && (
        <div className="all-clear section" role="status"><Icon name="check" size={18} /> Added {result.added.toLocaleString()}. {result.skipped > 0 && `Skipped ${result.skipped.toLocaleString()} already imported.`}</div>
      )}

      <div className="card section form-stack">
        <div className="form-group">
          <label className="form-label" htmlFor="im-vehicle">Vehicle</label>
          <select id="im-vehicle" className="form-select" value={vehicleId ?? ""} onChange={e => setVehicleId(Number(e.target.value) || null)}>
            <option value="">Choose a vehicle…</option>
            {editable.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <span className="form-label">The file contains</span>
          <div className="seg">
            <button type="button" className={type === "service" ? "on" : ""} onClick={() => chooseType("service")}>Service</button>
            <button type="button" className={type === "fuel" ? "on" : ""} onClick={() => chooseType("fuel")}>Fill-ups</button>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="im-file">CSV file</label>
          <input id="im-file" type="file" accept=".csv,text/csv,text/plain" className="form-input"
            // Cleared after each pick, or browsers ignore choosing the same file again.
            onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; choose(file); }} />
          {grid && <p className="form-hint">{fileName}: {body.length.toLocaleString()} rows</p>}
        </div>
      </div>

      {grid && (
        <>
          <div className="card section">
            <div className="card-title report-title">Match your columns</div>
            {TARGETS[type].map(t => (
              <div key={t.key} className="map-row">
                <label htmlFor={`map-${t.key}`}>{t.label}{t.required ? " *" : ""}</label>
                <select id={`map-${t.key}`} className="form-select" value={map[t.key] ?? ""}
                  onChange={e => setMap({ ...map, [t.key]: e.target.value === "" ? undefined : Number(e.target.value) })}>
                  <option value="">Not in this file</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div className="card section">
            <div className="card-title report-title">How to read the values</div>
            <div className="settings-row">
              <div className="settings-label">Dates</div>
              <select className="form-select import-select" aria-label="Date format" value={order} onChange={e => setOrder(e.target.value as DateOrder)}>
                <option value="mdy">Month / day / year</option>
                <option value="dmy">Day / month / year</option>
                <option value="ymd">Year - month - day</option>
              </select>
            </div>
            {vehicle?.meterType !== "hours" && (
              <div className="settings-row">
                <div className="settings-label">Readings are in</div>
                <div className="seg">{(["mi", "km"] as const).map(u => <button key={u} type="button" className={du === u ? "on" : ""} onClick={() => setDu(u)}>{u}</button>)}</div>
              </div>
            )}
            {type === "fuel" && (
              <div className="settings-row">
                <div className="settings-label">Fuel is in</div>
                <div className="seg">{(["gal", "L"] as const).map(u => <button key={u} type="button" className={vu === u ? "on" : ""} onClick={() => setVu(u)}>{u}</button>)}</div>
              </div>
            )}
          </div>

          {!vehicle ? <p className="settings-hint section">Choose a vehicle above to see the preview.</p> : missing.length > 0 ? (
            <p className="form-error section">Match a column for: {missing.map(m => m.label).join(", ")}</p>
          ) : (
            <div className="card section">
              <div className="card-title report-title">Preview</div>
              <p className="settings-label">
                {parsed.rows.length.toLocaleString()} ready to import
                {dates.length > 0 && `, ${fmtDate(dates[0])} to ${fmtDate(dates[dates.length - 1])}`}
              </p>
              {parsed.preview.slice(0, 5).map((p, i) => <div key={i} className="ready-row"><span>{p.label}</span><b>{fmtDate(p.date)}</b></div>)}
              {parsed.problems.length > 0 && (
                <div className="import-problems">
                  <p className="form-error">{parsed.problems.length.toLocaleString()} {parsed.problems.length === 1 ? "row" : "rows"} will be left out:</p>
                  <ul>{parsed.problems.slice(0, 8).map(p => <li key={p}>{p}</li>)}</ul>
                  {parsed.problems.length > 8 && <p className="settings-hint">and {(parsed.problems.length - 8).toLocaleString()} more</p>}
                </div>
              )}
              <div className="flex gap-2 justify-between import-confirm">
                <span className="settings-hint">Importing the same rows again won't create duplicates.</span>
                <button className="btn-primary" disabled={saving || parsed.rows.length === 0} onClick={save}>{saving ? "Importing…" : `Import ${parsed.rows.length.toLocaleString()}`}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
