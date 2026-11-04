import { db } from "../db";
import { bad, HttpError, int, notFound, text } from "../api";
import { deleteFile, MAX_UPLOAD_BYTES, saveFile, sniffType } from "../files";
import { ATTACHMENT_CATEGORIES, type Attachment } from "../types";
import { requireVehicle } from "./vehicles";

type Row = {
  id: number; vehicle_id: number; service_id: number | null; build_log_id: number | null; category: string;
  filename: string; stored_name: string; mime: string; size: number; caption: string | null; created_at: string; who: string | null;
};

const SELECT = "SELECT a.*, u.username AS who FROM attachments a LEFT JOIN users u ON u.id = a.created_by";

const toAttachment = (r: Row): Attachment => ({
  id: r.id, vehicleId: r.vehicle_id, serviceId: r.service_id, buildLogId: r.build_log_id, category: r.category,
  filename: r.filename, mime: r.mime, size: r.size, caption: r.caption, createdAt: r.created_at, by: r.who,
});

export function listAttachments(vehicleId: number, filter: { serviceId?: number; buildLogId?: number } = {}): Attachment[] {
  const rows = (filter.serviceId !== undefined
    ? db.prepare(`${SELECT} WHERE a.vehicle_id = ? AND a.service_id = ? ORDER BY a.id DESC`).all(vehicleId, filter.serviceId)
    : filter.buildLogId !== undefined
      ? db.prepare(`${SELECT} WHERE a.vehicle_id = ? AND a.build_log_id = ? ORDER BY a.id DESC`).all(vehicleId, filter.buildLogId)
      : db.prepare(`${SELECT} WHERE a.vehicle_id = ? ORDER BY a.id DESC`).all(vehicleId)) as Row[];
  return rows.map(toAttachment);
}

function category(v: unknown): string {
  return ATTACHMENT_CATEGORIES.includes(v as never) ? (v as string) : "other";
}

function linkId(v: FormDataEntryValue | null, table: "service_records" | "build_log", vehicleId: number): number | null {
  if (v === null || v === "") return null;
  const id = int(v, "link");
  // Without this, a file could be attached to a record on a vehicle the uploader can't see.
  if (!db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND vehicle_id = ?`).get(id, vehicleId)) throw bad("That record isn't on this vehicle");
  return id;
}

export async function addAttachment(userId: number, vehicleId: number, form: FormData): Promise<Attachment> {
  requireVehicle(userId, vehicleId, "edit");
  const file = form.get("file");
  if (!(file instanceof File)) throw bad("Choose a file to upload");
  if (file.size === 0) throw bad("That file is empty");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "Files can be up to 25 MB");
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniffType(bytes);
  if (!type) throw bad("Only photos (JPEG, PNG, WebP, GIF, HEIC) and PDFs can be uploaded");

  const serviceId = linkId(form.get("serviceId"), "service_records", vehicleId);
  const buildLogId = linkId(form.get("buildLogId"), "build_log", vehicleId);
  const stored = saveFile(bytes, type.ext);
  try {
    const info = db.prepare(`INSERT INTO attachments (vehicle_id, service_id, build_log_id, category, filename, stored_name, mime, size, caption, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      vehicleId, serviceId, buildLogId, category(form.get("category")),
      file.name.replace(/[^\w.\- ()]/g, "_").replace(/\.{2,}/g, ".").slice(0, 160) || `file.${type.ext}`,
      stored, type.mime, bytes.length, text(form.get("caption"), 500), userId,
    );
    const row = db.prepare(`${SELECT} WHERE a.id = ?`).get(info.lastInsertRowid) as Row;
    return toAttachment(row);
  } catch (e) {
    deleteFile(stored);
    throw e;
  }
}

function load(id: number) {
  const r = db.prepare("SELECT * FROM attachments WHERE id = ?").get(id) as { vehicle_id: number; stored_name: string; mime: string; filename: string } | undefined;
  if (!r) throw notFound("File not found");
  return r;
}

export function attachmentForDownload(userId: number, id: number) {
  const r = load(id);
  requireVehicle(userId, r.vehicle_id, "view");
  return r;
}

export function updateAttachment(userId: number, id: number, b: any) {
  requireVehicle(userId, load(id).vehicle_id, "edit");
  db.prepare("UPDATE attachments SET caption = ?, category = ? WHERE id = ?").run(text(b.caption, 500), category(b.category), id);
}

export function deleteAttachment(userId: number, id: number) {
  const r = load(id);
  requireVehicle(userId, r.vehicle_id, "edit");
  db.prepare("DELETE FROM attachments WHERE id = ?").run(id);
  deleteFile(r.stored_name);
}
