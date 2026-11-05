"use client";

import { useState } from "react";
import Modal from "@/app/components/Modal";
import { useMe } from "@/app/components/MeContext";
import { api, localDay, parseNum } from "@/lib/client";
import type { Vehicle } from "@/lib/types";
import { fmtReading, meterUnit, readingFromInput, toCents } from "@/lib/units";

export default function SoldModal({ vehicle, onClose, onDone }: { vehicle: Vehicle; onClose: () => void; onDone: () => void }) {
  const { me } = useMe();
  const [date, setDate] = useState(localDay());
  const [price, setPrice] = useState("");
  const [reading, setReading] = useState("");
  const [err, setErr] = useState("");
  const unit = meterUnit(vehicle.meterType, me.distanceUnit);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setErr("");
    const p = parseNum(price);
    const r = parseNum(reading);
    if (price.trim() && p === null) return setErr("Enter the price as a number");
    if (reading.trim() && r === null) return setErr("Enter the reading as a number");
    try {
      await api(`/api/vehicles/${vehicle.id}/sold`, { body: {
        date,
        price: p === null ? null : toCents(p),
        reading: r === null ? null : readingFromInput(r, vehicle.meterType, me.distanceUnit),
      } });
      onDone();
    } catch (x) { setErr((x as Error).message); }
  }

  return (
    <Modal title={`Mark ${vehicle.name} as sold`} onClose={onClose} footer={<button className="btn-primary" onClick={() => save()} disabled={!date}>Mark as sold</button>}>
      <form className="form-stack" onSubmit={save}>
        {err && <p className="form-error">{err}</p>}
        <p className="settings-hint">It moves out of your garage, the due list and reminders. All of its records stay, and you can undo this any time.</p>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label" htmlFor="sold-date">Date sold</label>
            <input id="sold-date" type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="sold-price">Sale price ({vehicle.currency}, optional)</label>
            <input id="sold-price" className="form-input" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="sold-reading">Final reading ({unit}, optional)</label>
          <input id="sold-reading" className="form-input" inputMode="decimal" placeholder={`Current: ${fmtReading(vehicle.reading, vehicle.meterType, me.distanceUnit)}`} value={reading} onChange={e => setReading(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
