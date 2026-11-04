"use client";

import { useState } from "react";
import AttachmentList from "@/app/components/AttachmentList";
import Icon from "@/app/components/Icon";
import QuickForm, { type Field } from "@/app/components/QuickForm";
import { api, fmtDate, localDay, parseNum, useApi } from "@/lib/client";
import type { BuildData, BuildLogEntry, BuildStage, BuildTask, Vehicle, WishlistItem } from "@/lib/types";
import { fmtMoney, toCents } from "@/lib/units";

type Editing =
  | { kind: "stage"; item?: BuildStage }
  | { kind: "task"; stageId: number; item?: BuildTask }
  | { kind: "wish"; item?: WishlistItem }
  | { kind: "log"; item?: BuildLogEntry };

const amount = (cents: number | null | undefined) => (cents ? (cents / 100).toFixed(2) : "");

function moneyCents(s: string, label: string): number | null {
  if (!s.trim()) return null;
  const n = parseNum(s);
  if (n === null) throw new Error(`${label} must be a number`);
  return toCents(n);
}

const STATUS = { planned: "badge-purple", bought: "badge-cyan", installed: "badge-green" };

export default function BuildTab({ vehicle: v }: { vehicle: Vehicle }) {
  const { data, error, reload } = useApi<BuildData>(`/api/vehicles/${v.id}/build`);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [err, setErr] = useState("");
  const canEdit = v.role !== "viewer";
  const money = (c: number) => fmtMoney(c, v.currency);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <div className="loading">Loading…</div>;
  const t = data.totals;

  async function toggle(task: BuildTask) {
    setErr("");
    try { await api(`/api/build/task/${task.id}`, { method: "PATCH", body: { ...task, done: !task.done } }); reload(); }
    catch (x) { setErr((x as Error).message); }
  }

  async function save(type: string, id: number | undefined, body: object) {
    if (id) await api(`/api/build/${type}/${id}`, { method: "PATCH", body });
    else await api(`/api/vehicles/${v.id}/build/${type}`, { body });
    setEditing(null);
    reload();
  }

  async function remove(type: string, id: number) {
    await api(`/api/build/${type}/${id}`, { method: "DELETE" });
    setEditing(null);
    reload();
  }

  const stageOptions = [{ value: "", label: "No stage" }, ...data.stages.map(s => ({ value: String(s.id), label: s.name }))];
  const wishFields: Field[] = [
    { key: "name", label: "Part", required: true },
    { key: "url", label: "Link", type: "url", placeholder: "https://" },
    { key: "planned", label: `Planned price (${v.currency})`, type: "number" },
    { key: "actual", label: `Actual price (${v.currency})`, type: "number", hint: "Leave empty to count the planned price once it's bought." },
    { key: "status", label: "Status", type: "select", options: [{ value: "planned", label: "Planned" }, { value: "bought", label: "Bought" }, { value: "installed", label: "Installed" }] },
    { key: "stageId", label: "Build stage", type: "select", options: stageOptions },
    { key: "notes", label: "Notes", type: "textarea" },
  ];

  return (
    <div className="section">
      {err && <p className="form-error" style={{ marginBottom: 12 }}>{err}</p>}

      <div className="stats-grid build-stats">
        <div className="stat-card"><div className="stat-card-label">Invested</div><div className="stat-card-value sm">{money(t.spentCents)}</div>
          <div className="stat-card-sub">{money(t.wishlistSpentCents)} parts bought · {money(t.upgradeCents)} upgrade work</div></div>
        <div className="stat-card"><div className="stat-card-label">Wishlist planned</div><div className="stat-card-value sm">{money(t.plannedCents)}</div></div>
        <div className="stat-card"><div className="stat-card-label">Hours</div><div className="stat-card-value sm">{t.hours.toLocaleString()}</div></div>
        <div className="stat-card"><div className="stat-card-label">Tasks done</div><div className="stat-card-value sm">{t.tasksDone}<small> / {t.tasksTotal}</small></div></div>
      </div>
      <p className="settings-hint section">Upgrade work is any service record in the Upgrade category. Log a part in the wishlist or on that record, not both, or it counts twice.</p>

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Stages</h2>
          {canEdit && <button className="btn-secondary btn-sm" onClick={() => setEditing({ kind: "stage" })}><Icon name="plus" size={14} /> Add stage</button>}
        </div>
        {data.stages.length === 0 && <p className="settings-hint">Group the work into phases, like "Stage 1 suspension", with a checklist for each.</p>}
        <div className="row-list">
          {data.stages.map(s => {
            const done = s.tasks.filter(x => x.done).length;
            return (
              <div key={s.id} className="row-card">
                <div className="row-top">
                  <span className="row-title">{s.name}</span>
                  <span className="flex gap-2 items-center">
                    <span className="row-sub">{done}/{s.tasks.length}</span>
                    {canEdit && <button className="icon-btn" aria-label={`Edit ${s.name}`} onClick={() => setEditing({ kind: "stage", item: s })}><Icon name="edit" size={15} /></button>}
                  </span>
                </div>
                {s.notes && <p className="row-body pre-wrap">{s.notes}</p>}
                <div className="task-list">
                  {s.tasks.map(task => (
                    <div key={task.id} className={`task-row ${task.done ? "done" : ""}`}>
                      <label className="check-row task-check">
                        <input type="checkbox" checked={task.done} disabled={!canEdit} onChange={() => toggle(task)} />
                        <span>{task.title}</span>
                      </label>
                      {task.hours !== null && <span className="row-sub">{task.hours} hr</span>}
                      {canEdit && <button className="icon-btn" aria-label={`Edit ${task.title}`} onClick={() => setEditing({ kind: "task", stageId: s.id, item: task })}><Icon name="edit" size={14} /></button>}
                    </div>
                  ))}
                </div>
                {canEdit && <button className="add-set-btn task-add" onClick={() => setEditing({ kind: "task", stageId: s.id })}><Icon name="plus" size={14} /> Task</button>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Wishlist</h2>
          {canEdit && <button className="btn-secondary btn-sm" onClick={() => setEditing({ kind: "wish" })}><Icon name="plus" size={14} /> Add part</button>}
        </div>
        {data.wishlist.length === 0 && <p className="settings-hint">Parts you plan to buy, with prices and links, so you can see planned against actual spend.</p>}
        <div className="row-list">
          {data.wishlist.map(w => (
            <div key={w.id} className="row-card">
              <div className="row-top">
                <span className="row-title">{w.url ? <a className="text-link" href={w.url} target="_blank" rel="noreferrer noopener">{w.name}</a> : w.name}</span>
                <span className={`badge ${STATUS[w.status]} capitalize`}>{w.status}</span>
              </div>
              <div className="due-foot">
                <span className="row-stats wish-stats">
                  <span>Planned <b>{money(w.plannedCents)}</b></span>
                  {w.actualCents !== null && <span>Actual <b>{money(w.actualCents)}</b></span>}
                </span>
                {canEdit && <button className="btn-secondary btn-sm" onClick={() => setEditing({ kind: "wish", item: w })}>Edit</button>}
              </div>
              {w.notes && <p className="row-body pre-wrap">{w.notes}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Build log</h2>
          {canEdit && <button className="btn-secondary btn-sm" onClick={() => setEditing({ kind: "log" })}><Icon name="plus" size={14} /> Add entry</button>}
        </div>
        {data.log.length === 0 && <p className="settings-hint">A dated timeline of the build. Save an entry, then add photos to it.</p>}
        <div className="row-list">
          {data.log.map(l => (
            <article key={l.id} className="row-card">
              <div className="row-top">
                <span className="row-title">{l.title}</span>
                <span className="flex gap-2 items-center">
                  <span className="row-sub">{fmtDate(l.date)}</span>
                  {canEdit && <button className="icon-btn" aria-label={`Edit ${l.title}`} onClick={() => setEditing({ kind: "log", item: l })}><Icon name="edit" size={15} /></button>}
                </span>
              </div>
              {l.body && <p className="row-body pre-wrap">{l.body}</p>}
              <div className="log-files"><AttachmentList vehicleId={v.id} buildLogId={l.id} canEdit={canEdit} /></div>
            </article>
          ))}
        </div>
      </section>

      {editing?.kind === "stage" && (
        <QuickForm title={editing.item ? "Edit stage" : "Add stage"} onClose={() => setEditing(null)}
          fields={[{ key: "name", label: "Name", required: true, placeholder: "Stage 1 suspension" }, { key: "notes", label: "Notes", type: "textarea" }]}
          initial={{ name: editing.item?.name ?? "", notes: editing.item?.notes ?? "" }}
          onSave={x => save("stage", editing.item?.id, x)}
          onDelete={editing.item ? () => remove("stage", editing.item!.id) : undefined}
          deleteConfirm="Delete this stage and its tasks? Wishlist parts stay." />
      )}
      {editing?.kind === "task" && (
        <QuickForm title={editing.item ? "Edit task" : "Add task"} onClose={() => setEditing(null)}
          fields={[{ key: "title", label: "Task", required: true }, { key: "hours", label: "Hours spent", type: "number" }]}
          initial={{ title: editing.item?.title ?? "", hours: editing.item?.hours?.toString() ?? "" }}
          onSave={x => {
            const hours = x.hours.trim() ? parseNum(x.hours) : null;
            if (x.hours.trim() && hours === null) throw new Error("Hours must be a number");
            return save("task", editing.item?.id, { title: x.title, hours, done: editing.item?.done ?? false, stageId: editing.stageId });
          }}
          onDelete={editing.item ? () => remove("task", editing.item!.id) : undefined} />
      )}
      {editing?.kind === "wish" && (
        <QuickForm title={editing.item ? "Edit part" : "Add part"} fields={wishFields} onClose={() => setEditing(null)}
          initial={{
            name: editing.item?.name ?? "", url: editing.item?.url ?? "", planned: amount(editing.item?.plannedCents),
            actual: editing.item?.actualCents === null || !editing.item ? "" : (editing.item.actualCents / 100).toFixed(2),
            status: editing.item?.status ?? "planned", stageId: editing.item?.stageId?.toString() ?? "", notes: editing.item?.notes ?? "",
          }}
          onSave={async x => save("wish", editing.item?.id, {
            name: x.name, url: x.url, status: x.status, notes: x.notes, stageId: x.stageId || null,
            plannedCents: moneyCents(x.planned, "Planned price") ?? 0, actualCents: moneyCents(x.actual, "Actual price"),
          })}
          onDelete={editing.item ? () => remove("wish", editing.item!.id) : undefined} />
      )}
      {editing?.kind === "log" && (
        <QuickForm title={editing.item ? "Edit entry" : "Add log entry"} onClose={() => setEditing(null)}
          fields={[{ key: "title", label: "Title", required: true }, { key: "date", label: "Date", type: "date", required: true }, { key: "body", label: "Writeup", type: "textarea" }]}
          initial={{ title: editing.item?.title ?? "", date: editing.item?.date ?? localDay(), body: editing.item?.body ?? "" }}
          onSave={x => save("log", editing.item?.id, x)}
          onDelete={editing.item ? () => remove("log", editing.item!.id) : undefined}
          deleteConfirm="Delete this entry? Its photos stay under Documents." />
      )}
    </div>
  );
}
