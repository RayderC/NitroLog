"use client";

import { useState } from "react";
import Modal from "@/app/components/Modal";

export type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea" | "select" | "url";
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  required?: boolean;
};

/** A modal form for simple records. `onSave` and `onDelete` throw to show an error in the form. */
export default function QuickForm({ title, fields, initial, onClose, onSave, onDelete, deleteConfirm }: {
  title: string;
  fields: Field[];
  initial: Record<string, string>;
  onClose: () => void;
  onSave: (values: Record<string, string>) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  deleteConfirm?: string;
}) {
  const [v, setV] = useState(initial);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const missing = fields.some(f => f.required && !(v[f.key] ?? "").trim());

  async function run(fn: () => Promise<unknown>) {
    setErr("");
    setBusy(true);
    try { await fn(); }
    catch (x) { setErr((x as Error).message); setBusy(false); }
  }

  const footer = (
    <>
      {onDelete && <button className="btn-danger" disabled={busy} onClick={() => { if (!deleteConfirm || confirm(deleteConfirm)) run(onDelete); }}>Delete</button>}
      <button className="btn-primary" disabled={busy || missing} onClick={() => run(() => onSave(v))}>Save</button>
    </>
  );

  return (
    <Modal title={title} onClose={onClose} footer={footer}>
      <div className="form-stack">
        {err && <p className="form-error">{err}</p>}
        {fields.map((f, i) => {
          const id = `qf-${f.key}`;
          const set = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [f.key]: e.target.value });
          return (
            <div className="form-group" key={f.key}>
              <label className="form-label" htmlFor={id}>{f.label}</label>
              {f.type === "textarea" ? (
                <textarea id={id} className="form-textarea" rows={4} value={v[f.key] ?? ""} placeholder={f.placeholder} onChange={set} />
              ) : f.type === "select" ? (
                <select id={id} className="form-select" value={v[f.key] ?? ""} onChange={set}>
                  {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input id={id} className="form-input" autoFocus={i === 0} type={f.type === "date" ? "date" : f.type === "url" ? "url" : "text"}
                  inputMode={f.type === "number" ? "decimal" : undefined} value={v[f.key] ?? ""} placeholder={f.placeholder} onChange={set} />
              )}
              {f.hint && <p className="form-hint">{f.hint}</p>}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
