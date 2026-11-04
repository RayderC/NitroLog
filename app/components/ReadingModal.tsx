"use client";

import { useState } from "react";
import Modal from "@/app/components/Modal";
import { useMe } from "@/app/components/MeContext";
import { api, localDay, parseNum } from "@/lib/client";
import type { Vehicle } from "@/lib/types";
import { fmtReading, meterUnit, readingFromInput } from "@/lib/units";

export default function ReadingModal({ vehicle, onClose, onDone }: { vehicle: Vehicle; onClose: () => void; onDone: () => void }) {
  const { me } = useMe();
  const [value, setValue] = useState("");
  const [date, setDate] = useState(localDay());
  const [err, setErr] = useState("");
  const unit = meterUnit(vehicle.meterType, me.distanceUnit);
  const n = parseNum(value);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (n === null) return;
    setErr("");
    try {
      await api(`/api/vehicles/${vehicle.id}/readings`, { body: { reading: readingFromInput(n, vehicle.meterType, me.distanceUnit), date } });
      onDone();
    } catch (x) { setErr((x as Error).message); }
  }

  return (
    <Modal title={`Update ${vehicle.name}`} onClose={onClose} footer={<button className="btn-primary" onClick={() => save()} disabled={n === null}>Save</button>}>
      <form className="form-stack" onSubmit={save}>
        {err && <p className="form-error">{err}</p>}
        <p className="settings-hint">Current: {fmtReading(vehicle.reading, vehicle.meterType, me.distanceUnit)}</p>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label" htmlFor="rd-value">Reading ({unit})</label>
            <input id="rd-value" className="form-input" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="rd-date">Date</label>
            <input id="rd-date" type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
        </div>
      </form>
    </Modal>
  );
}
