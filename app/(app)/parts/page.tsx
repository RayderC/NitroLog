"use client";

import { useEffect, useState } from "react";
import ShelfTab from "@/app/components/parts/ShelfTab";
import UsedTab from "@/app/components/parts/UsedTab";
import { useApi } from "@/lib/client";
import type { Vehicle } from "@/lib/types";

type Tab = "used" | "shelf";

/** Parts: what you've used before (the main list), and a shelf for anyone who keeps spares. */
export default function PartsPage() {
  const { data: vehicles } = useApi<Vehicle[]>("/api/vehicles");
  const [tab, setTab] = useState<Tab>("used");
  // The tab is remembered on this device.
  useEffect(() => { try { if (localStorage.getItem("nitrolog.parts.tab") === "shelf") setTab("shelf"); } catch { /* private mode */ } }, []);
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem("nitrolog.parts.tab", t); } catch { /* private mode */ } };
  const currency = vehicles?.[0]?.currency ?? "USD";

  return (
    <div className="page">
      <div className="dash-header">
        <div><h1 className="dash-title">Parts</h1><p className="dash-subtitle">Parts and fluids you&apos;ve used, what they cost, and where you got them</p></div>
      </div>
      <div className="tabs parts-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "used"} className={`tab ${tab === "used" ? "active" : ""}`} onClick={() => pick("used")}>Used before</button>
        <button role="tab" aria-selected={tab === "shelf"} className={`tab ${tab === "shelf" ? "active" : ""}`} onClick={() => pick("shelf")}>On the shelf</button>
      </div>
      {tab === "used" ? <UsedTab vehicles={vehicles} currency={currency} /> : <ShelfTab vehicles={vehicles} currency={currency} />}
    </div>
  );
}
