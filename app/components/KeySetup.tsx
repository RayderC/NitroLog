"use client";

import { useState } from "react";

export type KeyStatus = {
  configured: boolean;
  /** Where the key came from. A key set in the container can't be changed here. */
  source: "app" | "env" | null;
  /** The last few characters, so you can tell which key is in use. Never the whole key. */
  hint: string | null;
};

/**
 * A card for one optional service key: a fold-out guide to getting it, boxes to paste it into,
 * and Save, Test and Remove.
 */
export default function KeySetup({ title, description, guideTitle, steps, fields, status, onSave, onTest, testLabel = "Test" }: {
  title: string;
  description: React.ReactNode;
  guideTitle: string;
  steps: React.ReactNode[];
  fields: { id: string; label: string; placeholder: string }[];
  status: KeyStatus | undefined;
  onSave: (values: Record<string, string> | null) => Promise<void>;
  onTest: () => Promise<string>;
  testLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const fromEnv = status?.source === "env";

  async function run(fn: () => Promise<string | void>) {
    setBusy(true); setMsg(null);
    try { const t = await fn(); if (t) setMsg({ text: t, ok: true }); }
    catch (e) { setMsg({ text: (e as Error).message, ok: false }); }
    finally { setBusy(false); }
  }

  const filled = fields.every(f => (values[f.id] ?? "").trim());

  return (
    <div className="card section key-setup">
      <div className="key-head">
        <h2 className="section-title">{title}</h2>
        {status && <span className={`badge ${status.configured ? "badge-green" : "badge-dim"}`}>{status.configured ? "On" : "Off"}</span>}
      </div>
      <p className="settings-hint">{description}</p>

      <button type="button" className={`guide-toggle${open ? " open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">▶</span> {guideTitle}
      </button>
      {open && <ol className="guide-steps">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}

      {fromEnv ? (
        <p className="settings-hint">This key is set in the container's environment{status?.hint ? ` (ending ${status.hint})` : ""}. Change it there, or remove it there to manage it here.</p>
      ) : (
        <form className="form-stack" onSubmit={e => { e.preventDefault(); run(async () => { await onSave(values); setValues({}); return "Saved. Tap Test to check it works."; }); }}>
          {fields.map(f => (
            <div key={f.id} className="form-group">
              <label className="form-label" htmlFor={`key-${f.id}`}>{f.label}</label>
              <input data-bwignore="true" data-1p-ignore="true" data-lpignore="true" id={`key-${f.id}`} type="password" className="form-input key-input" autoComplete="off" spellCheck={false}
                placeholder={status?.configured && status.hint ? `Saved, ending ${status.hint}. Paste a new one to replace it.` : f.placeholder}
                value={values[f.id] ?? ""} onChange={e => setValues({ ...values, [f.id]: e.target.value })} />
            </div>
          ))}
          <div className="flex gap-2 key-actions">
            <button className="btn-primary btn-sm" disabled={busy || !filled}>Save</button>
            {status?.configured && <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => run(onTest)}>{busy ? "Checking…" : testLabel}</button>}
            {status?.configured && (
              <button type="button" className="btn-ghost btn-sm" disabled={busy}
                onClick={() => confirm(`Remove the ${title} key?`) && run(async () => { await onSave(null); return "Removed."; })}>Remove</button>
            )}
          </div>
        </form>
      )}
      {fromEnv && <div className="flex gap-2 key-actions"><button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => run(onTest)}>{busy ? "Checking…" : testLabel}</button></div>}
      {msg && <p className={msg.ok ? "key-ok" : "form-error"}>{msg.text}</p>}
    </div>
  );
}
