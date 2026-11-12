"use client";

import { useState } from "react";
import BackupsCard from "@/app/components/BackupsCard";
import EbaySetup from "@/app/components/EbaySetup";
import SsoSetup from "@/app/components/SsoSetup";
import UpdateNotice from "@/app/components/UpdateNotice";
import GeminiSetup from "@/app/components/GeminiSetup";
import Icon from "@/app/components/Icon";
import Modal from "@/app/components/Modal";
import { useMe } from "@/app/components/MeContext";
import { api, fmtDate, useApi } from "@/lib/client";

type U = { id: number; username: string; isAdmin: boolean; disabled: boolean; createdAt: string; vehicles: number };
type AdminVehicle = {
  id: number; name: string; year: number | null; make: string | null; model: string | null; ownerId: number; owner: string;
  sharedWith: string[]; archived: boolean; sold: boolean; records: number; lastActivity: string | null;
};

export default function AdminPage() {
  const { me } = useMe();
  const { data, error, reload } = useApi<U[]>(me.isAdmin ? "/api/admin/users" : null);
  const [creating, setCreating] = useState(false);
  const [editingUser, setEditingUser] = useState<U | null>(null);
  const [deleting, setDeleting] = useState<U | null>(null);
  const { data: vehicles, reload: reloadVehicles } = useApi<AdminVehicle[]>(me.isAdmin ? "/api/admin/vehicles" : null);
  const [err, setErr] = useState("");

  if (!me.isAdmin) return <div className="empty-state"><div className="empty-state-title">Admins only</div></div>;

  async function act(fn: () => Promise<unknown>) {
    setErr("");
    try { await fn(); await Promise.all([reload(), reloadVehicles()]); }
    catch (e) { setErr((e as Error).message); }
  }
  const people = (data ?? []).filter(u => !u.disabled);

  return (
    <div className="page page-narrow">
      <div className="dash-header">
        <div><h1 className="dash-title">Admin</h1><p className="dash-subtitle">Accounts on this server</p></div>
        <button className="btn-primary btn-sm" onClick={() => setCreating(true)}><Icon name="plus" size={14} /> New user</button>
      </div>
      <UpdateNotice />
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
                  <button className="btn-secondary btn-sm" onClick={() => setEditingUser(u)}><Icon name="edit" size={14} /> Edit</button>
                  {!self && !u.disabled && <button className="btn-secondary btn-sm" onClick={() => {
                    if (confirm(`Sign ${u.username} out of every device?`)) act(() => api(`/api/admin/users/${u.id}/sign-out`, { method: "POST" }));
                  }}>Sign out</button>}
                  {!self && <button className="btn-danger btn-sm" onClick={() => setDeleting(u)}>Delete</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="section">
        <div className="section-header"><h2 className="section-title">All vehicles</h2></div>
        <p className="settings-hint">Every vehicle on this server. You can give one to someone else or delete it. Their records stay private: to look inside one, make yourself the owner.</p>
        {!vehicles ? <div className="loading">Loading…</div> : vehicles.length === 0 ? <p className="settings-hint">No vehicles yet.</p> : (
          <div className="row-list">
            {vehicles.map(v => (
              <div key={v.id} className="row-card" data-vehicle={v.name}>
                <div className="row-top">
                  <span className="row-title">{v.name}</span>
                  <span className="flex gap-2">
                    {v.sold && <span className="badge badge-gold">Sold</span>}
                    {v.archived && <span className="badge badge-purple">Archived</span>}
                  </span>
                </div>
                <div className="row-stats">
                  {[v.year, v.make, v.model].some(Boolean) && <span>{[v.year, v.make, v.model].filter(Boolean).join(" ")}</span>}
                  <span>{v.records} {v.records === 1 ? "record" : "records"}</span>
                  {v.lastActivity && <span>Last {fmtDate(v.lastActivity)}</span>}
                  {v.sharedWith.length > 0 && <span>Shared with {v.sharedWith.join(", ")}</span>}
                </div>
                <div className="flex gap-2 items-center" style={{ marginTop: 10, flexWrap: "wrap" }}>
                  <label className="form-label" htmlFor={`own-${v.id}`} style={{ margin: 0 }}>Owner</label>
                  <select id={`own-${v.id}`} className="form-select admin-owner" value={v.ownerId}
                    onChange={e => act(() => api(`/api/admin/vehicles/${v.id}`, { method: "PATCH", body: { ownerId: Number(e.target.value) } }))}>
                    {(data ?? []).filter(u => !u.disabled || u.id === v.ownerId).map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                  </select>
                  <button className="btn-danger btn-sm" onClick={() => {
                    if (confirm(`Delete the ${v.name} and all of its history, for everyone? This can't be undone.`)) act(() => api(`/api/admin/vehicles/${v.id}`, { method: "DELETE" }));
                  }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="section">
        <div className="section-header"><h2 className="section-title">Optional services</h2></div>
        <EbaySetup />
        <GeminiSetup />
      </div>
      <SsoSetup appName="NitroLog" />
      <BackupsCard appName="NitroLog" what="the database and every photo and document" />
      {creating && <CreateUser onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
      {editingUser && <EditUser user={editingUser} self={editingUser.id === me.id} onClose={() => setEditingUser(null)} onDone={() => { setEditingUser(null); act(async () => {}); }} />}
      {deleting && <DeleteUser user={deleting} people={people.filter(p => p.id !== deleting.id)} onClose={() => setDeleting(null)}
        onDone={() => { setDeleting(null); act(async () => {}); }} />}
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
        <div className="form-group"><label className="form-label" htmlFor="nu-name">Username</label><input data-bwignore="true" data-1p-ignore="true" data-lpignore="true" id="nu-name" className="form-input" autoCapitalize="none" autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} autoFocus /></div>
        <div className="form-group"><label className="form-label" htmlFor="nu-pw">Password (8+ characters)</label><input data-bwignore="true" data-1p-ignore="true" data-lpignore="true" id="nu-pw" type="password" className="form-input" autoComplete="new-password" maxLength={72} value={password} onChange={e => setPassword(e.target.value)} /></div>
        <label className="check-row"><input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} /> Admin</label>
      </div>
    </Modal>
  );
}

/** Everything about an account in one place: name, password, admin, and whether it can sign in. */
function EditUser({ user, self, onClose, onDone }: { user: U; self: boolean; onClose: () => void; onDone: () => void }) {
  const [username, setUsername] = useState(user.username);
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(user.isAdmin);
  const [disabled, setDisabled] = useState(user.disabled);
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    const body: Record<string, unknown> = {};
    if (username.trim().toLowerCase() !== user.username) body.username = username;
    if (password) body.password = password;
    if (isAdmin !== user.isAdmin) body.isAdmin = isAdmin;
    if (disabled !== user.disabled) body.disabled = disabled;
    if (!Object.keys(body).length) return onClose();
    try {
      await api(`/api/admin/users/${user.id}`, { method: "PATCH", body });
      // A new password for yourself ends this session too.
      if (self && password) window.location.replace("/login");
      else onDone();
    } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal title={`Edit ${user.username}`} onClose={onClose}
      footer={<button className="btn-primary" onClick={save} disabled={username.trim().length < 2 || (password.length > 0 && password.length < 8)}>Save</button>}>
      <div className="form-stack">
        {err && <p className="form-error">{err}</p>}
        <div className="form-group"><label className="form-label" htmlFor="eu-name">Username</label>
          <input data-bwignore="true" data-1p-ignore="true" data-lpignore="true" id="eu-name" className="form-input" autoCapitalize="none" autoComplete="off" maxLength={40} value={username} onChange={e => setUsername(e.target.value)} />
          <p className="form-hint">They sign in with the new name from now on. Nobody is signed out.</p></div>
        <div className="form-group"><label className="form-label" htmlFor="eu-pw">New password</label>
          <input data-bwignore="true" data-1p-ignore="true" data-lpignore="true" id="eu-pw" type="password" className="form-input" autoComplete="new-password" maxLength={72} placeholder="Leave empty to keep the current one" value={password} onChange={e => setPassword(e.target.value)} />
          <p className="form-hint">8 or more characters. Setting one signs {self ? "you" : user.username} out of every device.</p></div>
        {!self && (
          <>
            <label className="check-row"><input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} /> Admin</label>
            <label className="check-row"><input type="checkbox" checked={disabled} onChange={e => setDisabled(e.target.checked)} /> Disabled (can&apos;t sign in)</label>
          </>
        )}
      </div>
    </Modal>
  );
}

type Plan = { vehicles: { id: number; name: string; heir: { id: number; username: string } | null }[] };

/** Deleting someone: each vehicle they own goes to someone, or is deleted. Nothing happens until you choose. */
function DeleteUser({ user, people, onClose, onDone }: { user: U; people: U[]; onClose: () => void; onDone: () => void }) {
  const { data: plan, error } = useApi<Plan>(`/api/admin/users/${user.id}`);
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [err, setErr] = useState("");
  const choiceFor = (v: Plan["vehicles"][number]) => choices[v.id] ?? (v.heir ? String(v.heir.id) : "");
  const missing = plan?.vehicles.some(v => !choiceFor(v)) ?? true;
  async function go() {
    setErr("");
    try {
      const vehicles = Object.fromEntries((plan?.vehicles ?? []).map(v => [v.id, choiceFor(v) === "delete" ? "delete" : Number(choiceFor(v))]));
      await fetch(`/api/admin/users/${user.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicles }) })
        .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message ?? `Failed (${r.status})`); });
      onDone();
    } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal title={`Delete ${user.username}`} onClose={onClose}
      footer={<button className="btn-danger" onClick={go} disabled={!plan || missing}>Delete {user.username}</button>}>
      <div className="form-stack">
        {(err || error) && <p className="form-error">{err || error}</p>}
        {!plan ? <div className="loading">Loading…</div> : plan.vehicles.length === 0 ? (
          <p>{user.username} doesn&apos;t own any vehicles. Their account and settings are removed. This can&apos;t be undone.</p>
        ) : (
          <>
            <p>Choose what happens to each vehicle {user.username} owns. This can&apos;t be undone.</p>
            {plan.vehicles.map(v => (
              <div key={v.id} className="form-group">
                <label className="form-label" htmlFor={`dv-${v.id}`}>{v.name}</label>
                <select id={`dv-${v.id}`} className="form-select" value={choiceFor(v)} onChange={e => setChoices({ ...choices, [v.id]: e.target.value })}>
                  {!v.heir && <option value="">Choose…</option>}
                  {people.map(p => <option key={p.id} value={p.id}>Give it to {p.username}{v.heir?.id === p.id ? " (it's shared with them)" : ""}</option>)}
                  <option value="delete">Delete it and all its history</option>
                </select>
              </div>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}
