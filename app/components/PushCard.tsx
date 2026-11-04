"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

function keyBytes(base64url: string) {
  const b = atob(base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "="));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}

export default function PushCard() {
  const [state, setState] = useState<"loading" | "unsupported" | "off" | "on">("loading");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches);
    (async () => {
      const reg = "serviceWorker" in navigator && "PushManager" in window ? await navigator.serviceWorker.getRegistration() : undefined;
      if (!reg) return setState("unsupported");
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true); setMsg("");
    try {
      if (await Notification.requestPermission() !== "granted") throw new Error("Notifications are blocked. Allow them for this site in your browser settings.");
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) throw new Error("The app isn't installed in this browser yet. Reload and try again.");
      const { publicKey } = await api<{ publicKey: string }>("/api/push");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      await api("/api/push", { body: sub.toJSON() });
      setState("on");
      setMsg("Notifications are on for this device.");
    } catch (x) { setMsg((x as Error).message); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMsg("");
    try {
      const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
      if (sub) {
        await api("/api/push/unsubscribe", { body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (x) { setMsg((x as Error).message); }
    finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setMsg("");
    try { await api("/api/push/test", { method: "POST" }); setMsg("Sent. It should arrive in a few seconds."); }
    catch (x) { setMsg((x as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="card section">
      <div className="card-title" style={{ marginBottom: 6 }}>Service reminders</div>
      <div className="settings-row">
        <div>
          <div className="settings-label">Notifications on this device</div>
          <div className="settings-hint">
            {state === "unsupported"
              ? "Not available in this browser. It needs HTTPS and the installed app."
              : "Once when something is due soon, once when it's overdue, then every 14 days while it stays overdue."}
          </div>
          {ios && state !== "on" && <div className="settings-hint">On iPhone, add NitroLog to your Home Screen first, then turn this on from there.</div>}
        </div>
        {(state === "off" || state === "on") && (
          <div className="flex gap-2">
            {state === "on" && <button className="btn-secondary btn-sm" disabled={busy} onClick={test}>Test</button>}
            <button className={state === "on" ? "btn-secondary btn-sm" : "btn-primary btn-sm"} disabled={busy} onClick={state === "on" ? disable : enable}>{state === "on" ? "Turn off" : "Turn on"}</button>
          </div>
        )}
      </div>
      {msg && <p className="settings-hint" role="status">{msg}</p>}
    </div>
  );
}
