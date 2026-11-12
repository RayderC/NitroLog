"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import Icon from "@/app/components/Icon";
import { useMe } from "@/app/components/MeContext";
import { api, parseNum, useApi } from "@/lib/client";
import { fmtMoney, toCents } from "@/lib/units";

export type LinkedPart = {
  store: string; kind: "part" | "fluid"; name: string; brand: string | null; partNumber: string | null; priceCents: number | null;
  quantity: number | null; unit: string | null; named: boolean; from: "title" | "page" | "link" | "ai" | "photo"; url: string;
};

/**
 * Makes a phone photo small enough to send quickly: the long side is capped and it's saved as JPEG.
 * Screenshots stay sharp enough to read. If the browser can't decode it, such as some HEIC photos, it's sent as is.
 */
async function shrink(file: File): Promise<Blob> {
  if (file.size < 1_500_000 && /^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}

const describe = (p: LinkedPart, currency: string) =>
  [p.brand, p.name, p.partNumber].filter(Boolean).join(" · ") + (p.priceCents !== null ? ` · ${fmtMoney(p.priceCents, currency)}` : "");

/**
 * Paste a link to a product, or read a screenshot or receipt: the part goes in with its name, brand, part number
 * and price. With `pickOne`, a picture with several parts asks which one; otherwise every part is added.
 */
export default function LinkPaste({ onPart, currency, label = "Add from a link or screenshot", pickOne = false }: {
  onPart: (p: LinkedPart, paidCents: number | null) => void; currency: string; label?: string; pickOne?: boolean;
}) {
  const { me } = useMe();
  const { data: readers } = useApi<{ photos: boolean; ebay: boolean }>("/api/parts/readers");
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState<"" | "link" | "photo">("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [choices, setChoices] = useState<LinkedPart[] | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function go() {
    if (!url.trim()) return;
    const paid = price.trim() ? parseNum(price.replace(/^\$/, "")) : null;
    if (price.trim() && (paid === null || paid < 0)) return setMsg({ ok: false, text: "The price should be a number, like 12.47." });
    setBusy("link"); setMsg(null); setChoices(null);
    try {
      const p = await api<LinkedPart>("/api/parts/from-link", { body: { url } });
      onPart(p, paid === null ? null : toCents(paid));
      setUrl(""); setPrice("");
      const check = p.from === "link" ? `${p.store} doesn't let apps read its pages, so the name comes from the link. Check it`
        : p.from === "ai" ? "Gemini read the page for you. Check the details" : "Check the details";
      setMsg({ ok: true, text: !p.named
        ? `Added. That ${p.store} link doesn't name the product, so type the name.`
        : paid !== null ? `Added from ${p.store} at the price you typed. ${check}.`
        : p.priceCents !== null ? `Added from ${p.store} at ${fmtMoney(p.priceCents, currency)}, its price there today. ${check}.`
        : `Added from ${p.store}. ${check}, and type what you paid in its Total box.` });
    } catch (x) { setMsg({ ok: false, text: (x as Error).message }); }
    finally { setBusy(""); }
  }

  async function readPicture(f: File | undefined) {
    if (!f) return;
    setBusy("photo"); setMsg(null); setChoices(null);
    try {
      const form = new FormData();
      form.append("image", await shrink(f), "picture");
      const res = await fetch("/api/parts/from-image", { method: "POST", body: form });
      if (res.status === 401) { window.location.href = "/login"; return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `Couldn't read that picture (${res.status})`);
      const parts = (data.parts ?? []) as LinkedPart[];
      if (!parts.length) return setMsg({ ok: false, text: "No parts found in that picture. Try a closer screenshot of the product or the order." });
      const from = data.store ? ` from ${data.store}` : "";
      if (pickOne && parts.length > 1) {
        setChoices(parts);
        return setMsg({ ok: true, text: `Found ${parts.length} parts${from}. Which one is this?` });
      }
      for (const p of parts) onPart(p, null);
      const missing = parts.filter(p => p.priceCents === null).length;
      setMsg({ ok: true, text: `Read ${parts.length === 1 ? "1 part" : `${parts.length} parts`}${from}`
        + (missing ? `. ${missing === 1 && parts.length === 1 ? "It has" : missing === 1 ? "One has" : "Some have"} no price, so type what you paid` : "")
        + ". Check them, since pictures can be misread." });
    } catch (x) { setMsg({ ok: false, text: (x as Error).message }); }
    finally { setBusy(""); if (file.current) file.current.value = ""; }
  }

  function choose(p: LinkedPart) {
    onPart(p, null);
    setChoices(null);
    setMsg({ ok: true, text: "Filled in from your picture. Check the details, since pictures can be misread." });
  }

  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); go(); } };

  /** Pasting a picture into the link box (Ctrl+V, or Paste on a phone) reads it, the same as choosing a file. */
  function onPaste(e: React.ClipboardEvent) {
    if (!readers?.photos || busy) return;
    const pic = Array.from(e.clipboardData.files).find(f => f.type.startsWith("image/"))
      ?? Array.from(e.clipboardData.items).find(i => i.kind === "file" && i.type.startsWith("image/"))?.getAsFile();
    if (!pic) return;
    e.preventDefault();
    readPicture(pic);
  }

  /** The Paste picture button reads the clipboard directly. Phones ask first, with a small Paste bubble. */
  async function pasteButton() {
    setMsg(null);
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find(t => t.startsWith("image/"));
        if (type) return readPicture(new File([await item.getType(type)], "pasted", { type }));
      }
      setMsg({ ok: false, text: "There's no picture on the clipboard. Copy a screenshot first, or paste a link above." });
    } catch {
      setMsg({ ok: false, text: "The browser didn't allow reading the clipboard. Press and hold the link box and choose Paste, or use Read a screenshot." });
    }
  }
  const canPasteButton = typeof navigator !== "undefined" && typeof navigator.clipboard?.read === "function";

  return (
    // Not a <form>: this sits inside other forms, and forms can't be nested.
    <div className="link-paste" onPaste={onPaste}>
      <label className="form-label" htmlFor="part-link">{label}</label>
      <div className="link-paste-row">
        <input id="part-link" className="form-input" inputMode="url" autoComplete="off"
          placeholder={readers?.photos ? "Paste a link or a picture" : "Paste a link to the product's page"}
          value={url} onChange={e => setUrl(e.target.value)} onKeyDown={enter} />
        <input className="form-input link-paste-price" inputMode="decimal" autoComplete="off" aria-label={`Price you paid in ${currency}`}
          placeholder="Price paid" title="Leave empty to use the store's price" value={price} onChange={e => setPrice(e.target.value)} onKeyDown={enter} />
        <button type="button" className="btn-secondary" disabled={!!busy || !url.trim()} onClick={go}>
          <Icon name="plus" size={14} /> {busy === "link" ? "Reading…" : "Add"}
        </button>
      </div>
      {readers?.photos ? (
        <div className="link-paste-photo">
          <input ref={file} type="file" accept="image/*" hidden aria-label="Screenshot or receipt picture" onChange={e => readPicture(e.target.files?.[0])} />
          <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => file.current?.click()}>
            <Icon name="upload" size={14} /> {busy === "photo" ? "Reading the picture…" : "Read a screenshot or receipt"}
          </button>
          {canPasteButton && (
            <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={pasteButton}>
              <Icon name="note" size={14} /> Paste picture
            </button>
          )}
        </div>
      ) : me.isAdmin && readers ? (
        <p className="form-hint">To read screenshots and receipts too, <Link href="/admin" className="text-cyan">add a free Gemini key on the Admin page</Link>.</p>
      ) : null}
      {msg && <p className={msg.ok ? "form-hint" : "form-error"}>{msg.text}</p>}
      {choices && (
        <div className="photo-choices">
          {choices.map((p, i) => <button key={i} type="button" className="btn-secondary btn-sm" onClick={() => choose(p)}>{describe(p, currency)}</button>)}
          <button type="button" className="link-btn" onClick={() => { setChoices(null); setMsg(null); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}
