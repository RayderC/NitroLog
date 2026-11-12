"use client";

import { useState } from "react";
import { useMe } from "@/app/components/MeContext";
import { api, fmtDate, useApi } from "@/lib/client";
import type { PriceWatch } from "@/lib/types";

const money = (c: number | null) => (c === null ? "–" : `$${(c / 100).toFixed(2)}`);

/** Settings: price-drop and recall alerts, each with its own switch, and the parts being watched. */
export default function AlertsCard() {
  const { me, reloadMe } = useMe();
  const { data: watches, reload } = useApi<PriceWatch[]>("/api/price-watches");
  const [err, setErr] = useState("");

  async function run(fn: () => Promise<unknown>, after: () => unknown) {
    setErr("");
    try { await fn(); await after(); } catch (x) { setErr((x as Error).message); }
  }
  const setMe = (body: object) => run(() => api("/api/me", { method: "PATCH", body }), reloadMe);

  return (
    <div className="card section" id="alerts">
      <div className="card-title" style={{ marginBottom: 6 }}>Alerts</div>
      <p className="settings-hint">Sent as notifications to the devices you&apos;ve turned on above. Each person picks their own.</p>
      {err && <p className="form-error">{err}</p>}
      <label className="check-row alert-switch">
        <input type="checkbox" checked={me.recallAlerts} onChange={e => setMe({ recallAlerts: e.target.checked })} />
        <span><b>Safety recalls</b><br /><span className="form-hint">Once a week NitroLog checks NHTSA&apos;s recall list for your vehicles. You only hear about a recall the first time it shows up, and each vehicle&apos;s page lists the open ones.</span></span>
      </label>
      <label className="check-row alert-switch">
        <input type="checkbox" checked={me.priceAlerts} onChange={e => setMe({ priceAlerts: e.target.checked })} />
        <span><b>Price drops</b><br /><span className="form-hint">Once a day NitroLog checks the parts you watch, and tells you when one drops at least 5% below what it was. Tap <b>Watch price</b> on a part with a store link to add it.</span></span>
      </label>
      {watches && watches.length > 0 && (
        <div className="row-list watch-list">
          {watches.map(w => (
            <div key={w.id} className={`row-card watch-row ${w.enabled ? "" : "off"}`}>
              <div className="row-top">
                <a className="row-title text-link" href={w.url} target="_blank" rel="noopener noreferrer">{w.name}</a>
                <label className="check-row"><input type="checkbox" checked={w.enabled} aria-label={`Watch ${w.name}`}
                  onChange={e => run(() => api(`/api/price-watches/${w.id}`, { method: "PATCH", body: { enabled: e.target.checked } }), reload)} /> Watch</label>
              </div>
              <div className="row-stats">
                <span>Now <b>{money(w.lastCents)}</b></span>
                <span>Started {money(w.startCents)}</span>
                <span>Lowest {money(w.lowCents)}</span>
                {w.checkedAt && <span>Checked {fmtDate(w.checkedAt.slice(0, 10))}</span>}
              </div>
              {w.problem && <p className="form-hint">{w.problem}</p>}
              <button type="button" className="link-btn" onClick={() => run(() => api(`/api/price-watches/${w.id}`, { method: "DELETE" }), reload)}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
