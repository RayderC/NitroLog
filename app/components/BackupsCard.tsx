"use client";

import { useRef, useState } from "react";
import Icon from "@/app/components/Icon";
import { api, useApi } from "@/lib/client";

type Backup = { name: string; size: number; createdAt: string };

const size = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const kindOf = (name: string) => (name.endsWith("-nightly.backup") ? "Nightly" : name.endsWith("-before-restore.backup") ? "Before a restore" : "Made by hand");

/**
 * Admin: nightly copies of the database, a download of everything, and restore.
 * `what` says what a download holds, e.g. "the database and every photo and document".
 */
export default function BackupsCard({ what, appName }: { what: string; appName: string }) {
  const { data, reload } = useApi<{ backups: Backup[]; folder: string }>("/api/admin/backups");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label); setMsg(null);
    try { setMsg({ text: await fn() }); await reload(); }
    catch (e) { setMsg({ text: (e as Error).message, error: true }); }
    finally { setBusy(""); }
  }

  const sure = () => confirm(`Replace everything in ${appName} with this backup?\n\nA copy of what's here now is saved first, so you can undo it from this list.`);

  async function restoreFile(f: File) {
    if (!sure()) return;
    await run("restore", async () => {
      const res = await fetch("/api/admin/backups/restore", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: f });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || `Restore failed (${res.status})`);
      setTimeout(() => location.reload(), 1500);
      return `Restored${j.files ? `, with ${j.files} files` : ""}. Reloading…`;
    });
  }

  async function restoreSaved(name: string) {
    if (!sure()) return;
    await run("restore", async () => {
      await api(`/api/admin/backups/restore?name=${encodeURIComponent(name)}`, { method: "POST" });
      setTimeout(() => location.reload(), 1500);
      return "Restored. Reloading…";
    });
  }

  const list = data?.backups ?? [];
  return (
    <div className="card section backups-card" id="backups">
      <div className="card-title" style={{ marginBottom: 6 }}>Backups</div>
      <p className="settings-hint">
        {appName} saves a copy of its database every night and keeps the last 7. They&apos;re in the same place as your data, so also
        tap <b>Download backup</b> now and then and keep the file somewhere else, like another computer or a cloud drive. It has {what}.
      </p>
      <div className="flex gap-2" style={{ flexWrap: "wrap", margin: "10px 0" }}>
        <a className="btn-primary btn-sm" href="/api/admin/backups/download"><Icon name="download" size={14} /> Download backup</a>
        <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => run("make", async () => { await api("/api/admin/backups", { method: "POST" }); return "Saved a copy."; })}>
          {busy === "make" ? "Saving…" : "Save a copy now"}
        </button>
        <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={14} /> {busy === "restore" ? "Restoring…" : "Restore from a file"}
        </button>
        <input ref={fileRef} type="file" hidden aria-label="Backup file" accept=".tar,.db,.backup,.json,application/x-tar,application/octet-stream"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) restoreFile(f); }} />
      </div>
      {msg && <p className={msg.error ? "form-error" : "form-hint"} role="status">{msg.text}</p>}
      {list.length > 0 && (
        <details className="backup-list">
          <summary>{list.length} saved {list.length === 1 ? "copy" : "copies"} · newest {when(list[0].createdAt)}</summary>
          <div className="row-list">
            {list.map(b => (
              <div key={b.name} className="row-card backup-row" data-backup={b.name}>
                <div className="row-top"><span className="row-title">{when(b.createdAt)}</span><span className="row-sub">{size(b.size)}</span></div>
                <div className="row-sub">{kindOf(b.name)}</div>
                <div className="flex gap-2" style={{ marginTop: 6 }}>
                  <a className="link-btn" href={`/api/admin/backups/download?name=${encodeURIComponent(b.name)}`}>Download</a>
                  <button type="button" className="link-btn" disabled={!!busy} onClick={() => restoreSaved(b.name)}>Restore this</button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
