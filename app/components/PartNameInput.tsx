"use client";

import { useMemo, useRef, useState } from "react";
import { fmtDate } from "@/lib/client";
import type { PartSuggestion } from "@/lib/types";
import { fmtMoney } from "@/lib/units";

/** Best first: on this vehicle, used often, used lately. Parts on the shelf come before history when they match equally. */
function rank(a: PartSuggestion, b: PartSuggestion) {
  return Number(b.onThisVehicle) - Number(a.onThisVehicle)
    || Number((b.onHand ?? 0) > 0) - Number((a.onHand ?? 0) > 0)
    || b.uses - a.uses
    || (b.lastDate ?? "").localeCompare(a.lastDate ?? "");
}

/** Every word typed has to appear in the name, part number or brand. */
function matches(p: PartSuggestion, words: string[]) {
  const hay = `${p.name} ${p.partNumber ?? ""} ${p.brand ?? ""}`.toLowerCase();
  return words.every(w => hay.includes(w));
}

/**
 * The name box on a part line. While it has focus it lists parts you've used before and parts on
 * your shelf, and picking one fills in the rest of the line.
 */
export default function PartNameInput({ value, kind, parts, currency, onChange, onPick }: {
  value: string;
  kind: "part" | "fluid";
  parts: PartSuggestion[];
  currency: string;
  onChange: (v: string) => void;
  onPick: (p: PartSuggestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);

  const list = useMemo(() => {
    const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return parts
      // Shelf stock has no part/fluid type, so it's offered on both.
      .filter(p => p.kind === kind || p.source === "stock")
      .filter(p => matches(p, words))
      // Nothing to suggest once the box already says exactly that.
      .filter(p => p.name.toLowerCase() !== value.trim().toLowerCase() || words.length === 0)
      .sort(rank)
      .slice(0, 6);
  }, [parts, kind, value]);

  const show = open && list.length > 0;

  function pick(p: PartSuggestion) {
    onPick(p);
    setOpen(false);
  }

  return (
    <div className="part-name">
      <input
        className="form-input" required placeholder={kind === "fluid" ? "Name, e.g. 5W-30 oil" : "Name, e.g. oil filter"} aria-label="Name"
        autoComplete="off" role="combobox" aria-expanded={show} aria-autocomplete="list"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => { if (closing.current) clearTimeout(closing.current); setOpen(true); }}
        // A tap on a suggestion blurs the box first, so wait a moment before closing the list.
        onBlur={() => { closing.current = setTimeout(() => setOpen(false), 150); }}
        onKeyDown={e => {
          if (!show) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((active + 1) % list.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((active - 1 + list.length) % list.length); }
          else if (e.key === "Enter") { e.preventDefault(); pick(list[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {show && (
        <ul className="part-suggest" role="listbox">
          {value.trim() === "" && <li className="part-suggest-head">Used before</li>}
          {list.map((p, i) => (
            <li key={`${p.source}-${p.inventoryId ?? ""}-${p.name}-${p.partNumber ?? ""}-${p.brand ?? ""}`} role="option" aria-selected={i === active}>
              <button type="button" className={`part-suggest-item${i === active ? " active" : ""}`}
                onMouseDown={e => e.preventDefault()} onClick={() => pick(p)}>
                <span className="part-suggest-name">{p.name}</span>
                <span className="part-suggest-meta">
                  {[p.brand, p.partNumber].filter(Boolean).join(" · ")}
                  {p.unitCostCents !== null && <> {(p.brand || p.partNumber) && "· "}<b>{fmtMoney(p.unitCostCents, currency)}</b>{p.unit ? `/${p.unit}` : " ea"}</>}
                </span>
                <span className="part-suggest-tag">
                  {p.source === "stock"
                    ? <span className={(p.onHand ?? 0) > 0 ? "tag-green" : "tag-dim"}>{p.onHand} on hand</span>
                    : <>{p.onThisVehicle ? "this vehicle" : p.vehicleName}{p.lastDate ? `, ${fmtDate(p.lastDate, { month: "short", year: "numeric" })}` : ""}</>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
