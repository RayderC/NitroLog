"use client";

import Link from "next/link";
import { useState } from "react";
import { useMe } from "@/app/components/MeContext";
import { api } from "@/lib/client";
import type { PriceWatch } from "@/lib/types";

/**
 * "Watch price" for a part with a store link. The list of watches is passed in, so a form with many parts
 * loads it once. With alerts off in Settings, it says so instead of quietly doing nothing.
 */
export default function WatchButton({ url, name, priceCents, watches, onChange }: {
  url: string; name: string; priceCents: number | null; watches: PriceWatch[] | undefined; onChange: () => void;
}) {
  const { me } = useMe();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!watches || !/^https?:\/\//i.test(url)) return null;
  // Stored links are normalised by the server, so compare without a trailing slash.
  const same = (a: string) => a.replace(/\/$/, "") === url.replace(/\/$/, "");
  const w = watches.find(x => same(x.url) && x.enabled);

  async function toggle() {
    setBusy(true); setErr("");
    try {
      if (w) await api(`/api/price-watches/${w.id}`, { method: "PATCH", body: { enabled: false } });
      else await api("/api/price-watches", { body: { url, name: name.trim() || "Part", priceCents } });
      onChange();
    } catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <button type="button" className="link-btn" disabled={busy} onClick={toggle} aria-pressed={!!w}>
        {w ? "Watching price ✓" : "Watch price"}
      </button>
      {w && !me.priceAlerts && <span className="form-hint"><Link href="/settings#alerts" className="text-cyan">Turn on price-drop alerts</Link> to hear about drops.</span>}
      {err && <span className="form-error">{err}</span>}
    </>
  );
}
