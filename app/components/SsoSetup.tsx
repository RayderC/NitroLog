"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/client";

type Status = { enabled: boolean; url: string | null; hint: string | null; fromEnv: boolean };

/** Admin: "Sign in with Amethyst". Amethyst's address and the shared secret from its dashboard. */
export default function SsoSetup({ appName }: { appName: string }) {
  const { data, setData } = useApi<Status>("/api/admin/sso");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  if (!data) return null;

  async function save(body: object, ok: string) {
    setMsg(null);
    try { setData(await api<Status>("/api/admin/sso", { method: "PUT", body })); setSecret(""); setMsg({ text: ok, ok: true }); }
    catch (e) { setMsg({ text: (e as Error).message, ok: false }); }
  }

  return (
    <div className="card section" id="sso-setup">
      <div className="card-title" style={{ marginBottom: 6 }}>Sign in with Amethyst</div>
      <p className="settings-hint">
        Adds a <b>Sign in with Amethyst</b> button to {appName}&apos;s login page. It signs in the {appName} account with the same username as
        the Amethyst account, so make the accounts here first. Passwords keep working too.
      </p>
      {data.enabled ? (
        <p className="form-hint">On, using <b>{data.url}</b> (secret ending in {data.hint}).{data.fromEnv ? " Set on the container, so change it there." : ""}</p>
      ) : (
        <p className="form-hint">Off. In Amethyst, open the dashboard, then <b>System</b>, turn on shared login, and copy its address and secret here.</p>
      )}
      {!data.fromEnv && (
        <div className="form-stack" style={{ marginTop: 10 }}>
          <input className="form-input" aria-label="Amethyst address" placeholder={data.url ?? "Amethyst's address, like http://192.168.1.5:3000"} value={url} onChange={e => setUrl(e.target.value)} />
          <input className="form-input" aria-label="Shared secret" placeholder="Shared secret" type="password" autoComplete="off" value={secret} onChange={e => setSecret(e.target.value)} />
          <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
            <button type="button" className="btn-primary btn-sm" disabled={!secret || !(url || data.url)} onClick={() => save({ url: url || data.url, secret }, "Saved. The login page now has the button.")}>Save</button>
            {data.enabled && <button type="button" className="btn-secondary btn-sm" onClick={() => save({ off: true }, "Turned off.")}>Turn off</button>}
          </div>
        </div>
      )}
      {msg && <p className={msg.ok ? "form-hint" : "form-error"} role="status">{msg.text}</p>}
    </div>
  );
}
