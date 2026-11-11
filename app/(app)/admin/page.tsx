"use client";

import { useState } from "react";
import EbaySetup from "@/app/components/EbaySetup";
import Icon from "@/app/components/Icon";
import Modal from "@/app/components/Modal";
import { useMe } from "@/app/components/MeContext";
import { api, fmtDate, useApi } from "@/lib/client";

type U = { id: number; username: string; isAdmin: boolean; disabled: boolean; createdAt: string; vehicles: number };

export default function AdminPage() {
  const { me } = useMe();
  const { data, error, reload } = useApi<U[]>(me.isAdmin ? "/api/admin/users" : null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<U | null>(null);
  const [err, setErr] = useState("");

  if (!me.isAdmin) return <div className="empty-state"><div className="empty-state-title">Admins only</div></div>;

  async function act(fn: () => Promise<unknown>) {
    setErr("");
    try { await fn(); await reload(); }
    catch (e) { setErr((e as Error).message); }
  }
  const patch = (u: U, body: object) => act(() => api(`/api/admin/users/${u.id}`, { method: "PATCH", body }));
  const remove = (u: U) => {
    if (!confirm(`Delete ${u.username}? Their shared vehicles pass to someone they're shared with. Vehicles nobody else can see are deleted with all their history. This can't be undone.`)) return;
    act(() => api(`/api/admin/users/${u.id}`, { method: "DELETE" }));
  };

  return (
    <div className="page page-narrow">
      <div className="dash-header">
        <div><h1 className="dash-title">Admin</h1><p className="dash-subtitle">Accounts on this server</p></div>
        <button className="btn-primary btn-sm" onClick={() => setCreating(true)}><Icon name="plus" size={14} /> New user</button>
      </div>
      {(err || error) && <p className="form-error" style={{ marginBottom: 12 }}>{err || error}</p>}
      {!data ? !error && <div className="loading">Loading…</div> : (
        <div className="row-list">
          {data.map(u => {
            const self = u.id === me.id;
            return (
              <div key={u.id} className="row-card" data-user={u.username}>
                <div className="row-top">
                  <span className="row-title">{u.username}{self && <span className="row-sub"> (you)</span>}</span>
                  <span className="flex gap-2">
                    {u.isAdmin && <span className="badge badge-purple">Admin</span>}
                    {u.disabled && <span className="badge badge-red">Disabled</span>}
                  </span>
                </div>
                <div className="row-stats">
                  <span><b>{u.vehicles}</b> {u.vehicles === 1 ? "vehicle" : "vehicles"}</span>
                  <span>Joined {fmtDate(u.createdAt)}</span>
                </div>
                <div className="flex gap-2" style={{ marginTop: 10, flexWrap: "wrap" }}>
                  <button className="btn-secondary btn-sm" onClick={() => setResetting(u)}>Reset password</button>
                  {!self && <button className="btn-secondary btn-sm" onClick={() => patch(u, { isAdmin: !u.isAdmin })}>{u.isAdmin ? "Remove admin" : "Make admin"}</button>}
                  {!self && <button className="btn-secondary btn-sm" onClick={() => patch(u, { disabled: !u.disabled })}>{u.disabled ? "Enable" : "Disable"}</button>}
                  {!self && <button className="btn-danger btn-sm" onClick={() => remove(u)}>Delete</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="section">
        <div className="section-header"><h2 className="section-title">Optional services</h2></div>
        <EbaySetup />
      </div>
      {creating && <CreateUser onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
      {resetting && <ResetPassword user={resetting} self={resetting.id === me.id} onClose={() => setResetting(null)} />}
    </div>
  );
}

function CreateUser({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    try { await api("/api/admin/users", { body: { username, password, isAdmin } }); onDone(); }
    catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal title="New user" onClose={onClose} footer={<button className="btn-primary" onClick={save} disabled={!username.trim() || password.length < 8}>Create</button>}>
      <div className="form-stack">
        {err && <p className="form-error">{err}</p>}
        <div className="form-group"><label className="form-label" htmlFor="nu-name">Username</label><input id="nu-name" className="form-input" autoCapitalize="none" autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} autoFocus /></div>
        <div className="form-group"><label className="form-label" htmlFor="nu-pw">Password (8+ characters)</label><input id="nu-pw" type="password" className="form-input" autoComplete="new-password" maxLength={72} value={password} onChange={e => setPassword(e.target.value)} /></div>
        <label className="check-row"><input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} /> Admin</label>
      </div>
    </Modal>
  );
}

function ResetPassword({ user, self, onClose }: { user: U; self: boolean; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    try {
      await api(`/api/admin/users/${user.id}`, { method: "PATCH", body: { password } });
      // Resetting your own password here ends this session too.
      if (self) window.location.replace("/login");
      else onClose();
    } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal title={`Reset password for ${user.username}`} onClose={onClose} footer={<button className="btn-primary" onClick={save} disabled={password.length < 8}>Set password</button>}>
      <div className="form-stack">
        {err && <p className="form-error">{err}</p>}
        <p className="form-hint">This signs {self ? "you" : user.username} out of every device.</p>
        <div className="form-group"><label className="form-label" htmlFor="rp-pw">New password (8+ characters)</label><input id="rp-pw" type="password" className="form-input" autoComplete="new-password" maxLength={72} value={password} onChange={e => setPassword(e.target.value)} autoFocus /></div>
      </div>
    </Modal>
  );
}
