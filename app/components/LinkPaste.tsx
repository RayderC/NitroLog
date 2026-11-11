"use client";

import { useState } from "react";
import Icon from "@/app/components/Icon";
import { api } from "@/lib/client";

export type LinkedPart = {
  store: string; name: string; brand: string | null; partNumber: string | null; priceCents: number | null; named: boolean; url: string;
};

/** "Paste a store link": fills in a part line from an Amazon, AutoZone or O'Reilly product link. */
export default function LinkPaste({ onPart }: { onPart: (p: LinkedPart) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function go(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const p = await api<LinkedPart>("/api/parts/from-link", { body: { url } });
      onPart(p);
      setUrl("");
      setMsg({ ok: true, text: !p.named
        ? `That ${p.store} link doesn't name the product, so type the name and what you paid. Links copied from the product page usually work better.`
        : `Filled in from the ${p.store} link. Type what you paid, since stores don't let apps read their prices, and fix anything that's off.` });
    } catch (x) { setMsg({ ok: false, text: (x as Error).message }); }
    finally { setBusy(false); }
  }

  return (
    // Not a <form>: this sits inside the service form, and forms can't be nested.
    <div className="link-paste">
      <label className="form-label" htmlFor="part-link">Add from a store link</label>
      <div className="link-paste-row">
        <input id="part-link" className="form-input" inputMode="url" autoComplete="off" placeholder="Paste an Amazon, AutoZone or O'Reilly link"
          value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); go(); } }} />
        <button type="button" className="btn-secondary" disabled={busy || !url.trim()} onClick={() => go()}>
          <Icon name="plus" size={14} /> {busy ? "Reading…" : "Add"}
        </button>
      </div>
      {msg && <p className={msg.ok ? "form-hint" : "form-error"}>{msg.text}</p>}
    </div>
  );
}
