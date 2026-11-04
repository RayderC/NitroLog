"use client";

import { useState } from "react";
import { useMe } from "@/app/components/MeContext";
import { api, useApi } from "@/lib/client";
import type { Member, Vehicle } from "@/lib/types";

export default function SharingTab({ vehicle: v, reload, onLeft }: { vehicle: Vehicle; reload: () => void; onLeft: () => void }) {
  const { me } = useMe();

  if (v.role !== "owner") {
    return (
      <div className="card section">
        <p className="settings-label">{v.ownerName} owns this vehicle.</p>
        <p className="settings-hint" style={{ marginBottom: 12 }}>
          You {v.role === "editor" ? "can view and edit it, but only the owner can share or delete it." : "have view-only access."}
        </p>
        <button className="btn-secondary btn-sm" onClick={async () => {
          if (!confirm(`Stop sharing ${v.name} with you? The owner would have to add you again.`)) return;
          await api(`/api/vehicles/${v.id}/members/${me.id}`, { method: "DELETE" });
          onLeft();
        }}>Leave this vehicle</button>
      </div>
    );
  }
  return <OwnerSharing vehicle={v} reload={reload} />;
}

function OwnerSharing({ vehicle: v, reload }: { vehicle: Vehicle; reload: () => void }) {
  const { data, error, reload: reloadMembers } = useApi<Member[]>(`/api/vehicles/${v.id}/members`);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Member["role"]>("editor");
  const [err, setErr] = useState("");

  async function act(fn: () => Promise<unknown>) {
    setErr("");
    try { await fn(); await reloadMembers(); reload(); }
    catch (x) { setErr((x as Error).message); }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await act(() => api(`/api/vehicles/${v.id}/members`, { body: { username, role } }));
    setUsername("");
  }

  return (
    <div className="section">
      <form className="card section" onSubmit={add}>
        <div className="card-title" style={{ marginBottom: 12 }}>Share this vehicle</div>
        <div className="form-stack">
          {err && <p className="form-error">{err}</p>}
          <div className="form-group">
            <label className="form-label" htmlFor="m-user">Username</label>
            <input id="m-user" className="form-input" autoCapitalize="none" autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} />
            <p className="form-hint">They need an account on this server. An admin can create one.</p>
          </div>
          <div className="share-add">
            <div className="seg">
              <button type="button" className={role === "editor" ? "on" : ""} onClick={() => setRole("editor")}>Editor</button>
              <button type="button" className={role === "viewer" ? "on" : ""} onClick={() => setRole("viewer")}>Viewer</button>
            </div>
            <button className="btn-primary btn-sm" disabled={!username.trim()}>Share</button>
          </div>
        </div>
      </form>

      {error && <p className="form-error">{error}</p>}
      <div className="section-header"><h2 className="section-title">People with access</h2></div>
      {!data ? !error && <div className="loading">Loading…</div> : data.length === 0 ? (
        <p className="settings-hint">Only you can see this vehicle.</p>
      ) : (
        <div className="row-list">
          {data.map(m => (
            <div key={m.userId} className="row-card reading-row">
              <span className="row-title reading-main">{m.username}</span>
              <div className="seg">
                {(["editor", "viewer"] as const).map(r => (
                  <button key={r} className={m.role === r ? "on" : ""} onClick={() => act(() => api(`/api/vehicles/${v.id}/members/${m.userId}`, { method: "PATCH", body: { role: r } }))}>{r}</button>
                ))}
              </div>
              <button className="btn-danger btn-sm" onClick={() => act(() => api(`/api/vehicles/${v.id}/members/${m.userId}`, { method: "DELETE" }))}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
