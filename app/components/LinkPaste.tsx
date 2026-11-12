"use client";

import { useState } from "react";
import Icon from "@/app/components/Icon";
import { api, parseNum } from "@/lib/client";
import { fmtMoney, toCents } from "@/lib/units";

export type LinkedPart = {
  store: string; kind: "part" | "fluid"; name: string; brand: string | null; partNumber: string | null; priceCents: number | null;
  quantity: number | null; unit: string | null; named: boolean; from: "title" | "link"; url: string;
};

/** Paste a store link and type what you paid: the part goes in with its name, brand, part number and price. */
export default function LinkPaste({ onPart, currency, label = "Add from a store link" }: { onPart: (p: LinkedPart, paidCents: number | null) => void; currency: string; label?: string }) {
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function go() {
    if (!url.trim()) return;
    const paid = price.trim() ? parseNum(price.replace(/^\$/, "")) : null;
    if (price.trim() && (paid === null || paid < 0)) return setMsg({ ok: false, text: "The price should be a number, like 12.47." });
    setBusy(true); setMsg(null);
    try {
      const p = await api<LinkedPart>("/api/parts/from-link", { body: { url } });
      onPart(p, paid === null ? null : toCents(paid));
      setUrl(""); setPrice("");
      const check = p.from === "title" || p.store !== "Amazon" ? "Check the details" : "Amazon didn't describe that page, so check the name";
      setMsg({ ok: true, text: !p.named
        ? `Added. That ${p.store} link doesn't name the product, so type the name.`
        : paid !== null ? `Added from ${p.store} at the price you typed. ${check}.`
        : p.priceCents !== null ? `Added from ${p.store} at ${fmtMoney(p.priceCents, currency)}, its price there today. ${check}.`
        : `Added from ${p.store}. ${check}, and type what you paid in its Total box.` });
    } catch (x) { setMsg({ ok: false, text: (x as Error).message }); }
    finally { setBusy(false); }
  }

  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); go(); } };

  return (
    // Not a <form>: this sits inside the service form, and forms can't be nested.
    <div className="link-paste">
      <label className="form-label" htmlFor="part-link">{label}</label>
      <div className="link-paste-row">
        <input id="part-link" className="form-input" inputMode="url" autoComplete="off" placeholder="Paste an Amazon, AutoZone or O'Reilly link"
          value={url} onChange={e => setUrl(e.target.value)} onKeyDown={enter} />
        <input className="form-input link-paste-price" inputMode="decimal" autoComplete="off" aria-label={`Price you paid in ${currency}`}
          placeholder="Price paid" title="Leave empty to use the store's price" value={price} onChange={e => setPrice(e.target.value)} onKeyDown={enter} />
        <button type="button" className="btn-secondary" disabled={busy || !url.trim()} onClick={go}>
          <Icon name="plus" size={14} /> {busy ? "Reading…" : "Add"}
        </button>
      </div>
      {msg && <p className={msg.ok ? "form-hint" : "form-error"}>{msg.text}</p>}
    </div>
  );
}
