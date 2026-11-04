import fs from "fs";
import { Zip, ZipPassThrough } from "fflate";
import { filePath } from "../files";
import { attachmentForDownload, listAttachments } from "./attachments";
import { getBuild } from "./builds";
import { listFuel } from "./fuelLogs";
import { listInventory } from "./inventory";
import { listSchedule } from "./schedule";
import { getService, listService } from "./service";
import { listSpecs } from "./specs";
import { listTrack } from "./track";
import { listMembers, listReadings, listVehicles } from "./vehicles";

export function exportJson(userId: number, today: string) {
  const vehicles = listVehicles(userId).map(v => ({
    ...v,
    readings: listReadings(v.id, Number.MAX_SAFE_INTEGER),
    schedule: listSchedule(v, today),
    service: listService(v.id).map(s => getService(userId, s.id)),
    specs: listSpecs(v.id),
    fuel: listFuel(v.id).logs,
    attachments: listAttachments(v.id),
    build: getBuild(v.id),
    track: listTrack(v.id).days,
    members: v.role === "owner" ? listMembers(v.id) : undefined,
  }));
  return {
    format: "nitrolog-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    units: { readings: "meters or engine hours per vehicle meterType", fuel: "liters", money: "cents", pressure: "kPa", laps: "milliseconds" },
    vehicles,
    inventory: listInventory(userId),
  };
}

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // A cell starting with one of these would run as a formula when opened in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per service record or fill-up, in the viewer's units. */
export function exportCsv(userId: number, distanceUnit: "mi" | "km", volumeUnit: "gal" | "L"): string {
  const rows: unknown[][] = [["vehicle", "type", "date", "title", "category", `reading (${distanceUnit} or hr)`, `fuel (${volumeUnit})`, "cost", "currency", "labor hours", "parts", "notes"]];
  const reading = (r: number | null, meter: string) => (r === null ? "" : meter === "hours" ? r : Math.round(distanceUnit === "mi" ? r / 1609.344 : r / 1000));
  for (const v of listVehicles(userId)) {
    for (const s of listService(v.id)) {
      const d = getService(userId, s.id);
      rows.push([v.name, "service", s.date, s.title, s.category, reading(s.reading, v.meterType), "", (s.totalCents / 100).toFixed(2), v.currency, s.laborHours ?? "",
        d.items.map(i => [i.name, i.partNumber].filter(Boolean).join(" ")).join("; "), s.notes ?? ""]);
    }
    for (const f of listFuel(v.id).logs) {
      rows.push([v.name, "fuel", f.date, "", "", reading(f.reading, v.meterType), (volumeUnit === "gal" ? f.volumeL / 3.785411784 : f.volumeL).toFixed(3),
        (f.costCents / 100).toFixed(2), v.currency, "", "", f.notes ?? ""]);
    }
  }
  return rows.map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Streams a zip so a garage full of photos doesn't have to fit in memory. Files are stored as they are. */
export function exportZip(userId: number, today: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) return controller.error(err);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      const addBytes = (name: string, bytes: Uint8Array) => {
        const entry = new ZipPassThrough(name);
        zip.add(entry);
        entry.push(bytes, true);
      };
      (async () => {
        const data = exportJson(userId, today);
        addBytes("nitrolog-export.json", new TextEncoder().encode(JSON.stringify(data, null, 2)));
        for (const v of data.vehicles) {
          const folder = `files/${v.id}-${v.name.replace(/[^\w\- ]/g, "_")}`;
          for (const a of v.attachments) {
            const stored = attachmentForDownload(userId, a.id).stored_name;
            if (!fs.existsSync(filePath(stored))) { console.error("[export] missing file", stored); continue; }
            const entry = new ZipPassThrough(`${folder}/${a.id}-${a.filename}`);
            zip.add(entry);
            for await (const chunk of fs.createReadStream(filePath(stored))) entry.push(chunk as Uint8Array);
            entry.push(new Uint8Array(0), true);
          }
        }
        zip.end();
      })().catch(e => { console.error("[export]", e); controller.error(e); });
    },
  });
}
