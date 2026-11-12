"use client";

import Link from "next/link";
import { useState } from "react";
import { useMe } from "@/app/components/MeContext";
import { api } from "@/lib/client";
import type { PriceWatch } from "@/lib/types";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

/** The watch for a link, if any. Stored links are normalised by the server, so compare without a trailing slash. */
export function watchFor(watches: PriceWatch[] | undefined, url: string | null | undefined) {
  if (!watches || !url) return undefined;
  const u = url.replace(/\/$/, "");
  return watches.find(x => x.url.replace(/\/$/, "") === u);
}

/**
 * A "Watch price" checkbox for a part with a store link. The list of watches is passed in, so a page with many
 * parts loads it once. Ticking it also turns on price-drop alerts if they were off, and says so.
 */
export default function WatchButton({ url, name, priceCents, watches, onChange, showPrices = false }: {
  url: string; name: string; priceCents: number | null; watches: PriceWatch[] | undefined; onChange: () => void;
  /** Show the latest and lowest prices next to the box once it's watched. */
  showPrices?: boolean;
}) {
  const { me, reloadMe } = useMe();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  if (!watches || !/^https?:\/\//i.test(url)) return null;
  const found = watchFor(watches, url);
  const on = !!found?.enabled;

  async function toggle(want: boolean) {
    setBusy(true); setNote(null);
    try {
      if (!want && found) await api(`/api/price-watches/${found.id}`, { method: "PATCH", body: { enabled: false } });
      else if (want && found) await api(`/api/price-watches/${found.id}`, { method: "PATCH", body: { enabled: true } });
      else await api("/api/price-watches", { body: { url, name: name.trim() || "Part", priceCents } });
      if (want && !me.priceAlerts) {
        await api("/api/me", { method: "PATCH", body: { priceAlerts: true } });
        reloadMe();
        setNote({ ok: true, text: "Price-drop alerts are on now. You can switch them off in Settings." });
      }
      onChange();
    } catch (x) { setNote({ ok: false, text: (x as Error).message }); }
    finally { setBusy(false); }
  }

  return (
    <span className="watch-wrap">
      <label className={`watch-check ${on ? "on" : ""}`}>
        <input type="checkbox" checked={on} disabled={busy} onChange={e => toggle(e.target.checked)} />
        Watch price
        {showPrices && on && found?.lastCents != null && (
          <span className="watch-prices">
            now <b>{money(found.lastCents)}</b>
            {found.lowCents != null && found.lowCents < found.lastCents && <> · lowest {money(found.lowCents)}</>}
          </span>
        )}
        {showPrices && on && found?.lastCents == null && <span className="watch-prices">checked daily</span>}
      </label>
      {note && <span className={note.ok ? "form-hint" : "form-error"}>{note.text} {note.ok && <Link href="/settings#alerts" className="text-cyan">Settings</Link>}</span>}
    </span>
  );
}
