"use client";

import { useRef, useState } from "react";
import Icon from "@/app/components/Icon";
import { api, useApi } from "@/lib/client";
import { ATTACHMENT_CATEGORIES, type Attachment } from "@/lib/types";

const MAX_BYTES = 25 * 1024 * 1024;

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const fileUrl = (id: number) => `/api/attachments/${id}/file`;
// Most browsers can't draw HEIC, so those get a file tile with a download link instead of a broken image.
const showsInline = (a: Attachment) => a.mime.startsWith("image/") && a.mime !== "image/heic";

/** Files for a vehicle, or just the ones on one service record or build log entry. */
export default function AttachmentList({ vehicleId, serviceId, buildLogId, canEdit, showCategories }: {
  vehicleId: number; serviceId?: number; buildLogId?: number; canEdit: boolean; showCategories?: boolean;
}) {
  const query = serviceId ? `?service=${serviceId}` : buildLogId ? `?log=${buildLogId}` : "";
  const { data, error, reload } = useApi<Attachment[]>(`/api/vehicles/${vehicleId}/attachments${query}`);
  const [category, setCategory] = useState<string>("photo");
  const [filter, setFilter] = useState("all");
  const [status, setStatus] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    const problems: string[] = [];
    for (const [n, file] of list.entries()) {
      if (file.size > MAX_BYTES) { problems.push(`${file.name} is over 25 MB`); continue; }
      setStatus(`Uploading ${n + 1} of ${list.length}…`);
      const form = new FormData();
      form.set("file", file);
      form.set("category", serviceId || buildLogId ? (file.type === "application/pdf" ? "receipt" : "photo") : category);
      if (serviceId) form.set("serviceId", String(serviceId));
      if (buildLogId) form.set("buildLogId", String(buildLogId));
      const res = await fetch(`/api/vehicles/${vehicleId}/attachments`, { method: "POST", body: form }).catch(() => null);
      if (!res) problems.push(`${file.name}: couldn't reach the server`);
      else if (res.status === 401) { window.location.href = "/login"; return; }
      else if (!res.ok) problems.push(`${file.name}: ${(await res.json().catch(() => ({}))).message ?? `upload failed (${res.status})`}`);
    }
    setStatus(problems.join(". "));
    if (input.current) input.current.value = "";
    reload();
  }

  async function remove(a: Attachment) {
    if (!confirm(`Delete ${a.filename}? This can't be undone.`)) return;
    try { await api(`/api/attachments/${a.id}`, { method: "DELETE" }); reload(); }
    catch (x) { setStatus((x as Error).message); }
  }

  const shown = (data ?? []).filter(a => filter === "all" || a.category === filter);

  return (
    <div>
      {canEdit && (
        <div className="upload-row">
          {showCategories && (
            <select className="form-select upload-category capitalize" aria-label="File type" value={category} onChange={e => setCategory(e.target.value)}>
              {ATTACHMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <label className="btn-secondary btn-sm upload-button">
            <Icon name="upload" size={14} /> Add files
            <input ref={input} type="file" multiple hidden accept="image/*,application/pdf" onChange={e => upload(e.target.files)} />
          </label>
          {status && <span className="settings-hint" role="status">{status}</span>}
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
      {showCategories && (data?.length ?? 0) > 0 && (
        <div className="chip-wrap attach-filter">
          {["all", ...ATTACHMENT_CATEGORIES.filter(c => data?.some(a => a.category === c))].map(c => (
            <button key={c} className={`filter-chip capitalize ${filter === c ? "active" : ""}`} onClick={() => setFilter(c)}>{c}</button>
          ))}
        </div>
      )}
      {shown.length > 0 && (
        <div className="attach-grid">
          {shown.map(a => (
            <div key={a.id} className="attach-card">
              <a href={fileUrl(a.id)} target="_blank" rel="noreferrer" className="attach-thumb" aria-label={`Open ${a.filename}`}>
                {showsInline(a)
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={fileUrl(a.id)} alt={a.caption ?? a.filename} loading="lazy" />
                  : <span className="attach-doc"><Icon name="note" size={28} /><span>{a.mime === "application/pdf" ? "PDF" : "HEIC"}</span></span>}
              </a>
              <div className="attach-meta">
                <span className="attach-name" title={a.filename}>{a.filename}</span>
                <span className="row-sub">{size(a.size)}</span>
              </div>
              <div className="attach-actions">
                <a className="icon-btn" href={`${fileUrl(a.id)}?download`} aria-label={`Download ${a.filename}`}><Icon name="download" size={15} /></a>
                {canEdit && <button className="icon-btn" aria-label={`Delete ${a.filename}`} onClick={() => remove(a)}><Icon name="trash" size={15} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
