"use client";

import Link from "next/link";
import { useState } from "react";
import Icon from "@/app/components/Icon";
import { useMe } from "@/app/components/MeContext";
import PushCard from "@/app/components/PushCard";
import { api, localDay } from "@/lib/client";

export default function SettingsPage() {
  const { me, reloadMe } = useMe();
  const [pw, setPw] = useState({ current: "", next: "" });
  const [msg, setMsg] = useState("");

  async function set(body: Record<string, unknown>) {
    await api("/api/me", { method: "PATCH", body });
    reloadMe();
  }

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    try {
      await api("/api/me/password", { body: pw });
      setPw({ current: "", next: "" });
      setMsg("Password changed. Other devices have been signed out.");
    } catch (x) { setMsg((x as Error).message); }
  }

  return (
    <div className="page page-narrow">
      <div className="dash-header"><div><h1 className="dash-title">Settings</h1><p className="dash-subtitle">Signed in as {me.username}</p></div></div>

      <div className="card section">
        <div className="card-title" style={{ marginBottom: 6 }}>Units</div>
        <div className="settings-row">
          <div><div className="settings-label">Distance</div><div className="settings-hint">Switching converts what you see. Nothing stored changes.</div></div>
          <div className="seg">{(["mi", "km"] as const).map(u => <button key={u} className={me.distanceUnit === u ? "on" : ""} onClick={() => set({ distanceUnit: u })}>{u}</button>)}</div>
        </div>
        <div className="settings-row">
          <div><div className="settings-label">Fuel</div></div>
          <div className="seg">{(["gal", "L"] as const).map(u => <button key={u} className={me.volumeUnit === u ? "on" : ""} onClick={() => set({ volumeUnit: u })}>{u}</button>)}</div>
        </div>
      </div>

      <PushCard />

      <div className="card section">
        <div className="card-title" style={{ marginBottom: 6 }}>Your data</div>
        <div className="settings-row">
          <div><div className="settings-label">Import</div><div className="settings-hint">Bring in old service records or fill-ups from a CSV file</div></div>
          <Link href="/settings/import" className="btn-secondary btn-sm"><Icon name="upload" size={14} /> Import</Link>
        </div>
        <div className="settings-row">
          <div><div className="settings-label">Export</div><div className="settings-hint">A spreadsheet of records, all data as JSON, or a zip that also has your photos and documents</div></div>
          <div className="flex gap-2 export-links">
            {(["csv", "json", "zip"] as const).map(f => (
              <a key={f} className="btn-secondary btn-sm" href={`/api/export?format=${f}&today=${localDay()}`}><Icon name="download" size={14} /> {f.toUpperCase()}</a>
            ))}
          </div>
        </div>
      </div>

      <form className="card section" onSubmit={changePw}>
        <div className="card-title" style={{ marginBottom: 12 }}>Change password</div>
        <div className="form-stack">
          <input type="password" className="form-input" placeholder="Current password" aria-label="Current password" autoComplete="current-password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} />
          <input type="password" className="form-input" placeholder="New password (8+ characters)" aria-label="New password" autoComplete="new-password" maxLength={72} value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} />
          <div className="flex gap-2 items-center"><button className="btn-primary" disabled={!pw.current || pw.next.length < 8}>Change</button>{msg && <span className="text-muted" style={{ fontSize: 13 }}>{msg}</span>}</div>
        </div>
      </form>
    </div>
  );
}
