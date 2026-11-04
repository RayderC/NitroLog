import crypto from "crypto";
import fs from "fs";
import path from "path";
import { DB_PATH } from "./db";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const uploadDir = () => process.env.UPLOAD_DIR || path.join(path.dirname(DB_PATH), "uploads");

/**
 * Identifies a file by its first bytes and never by the name or type the browser sent. Only formats that
 * can't run script when opened are allowed, which is why SVG and HTML are refused.
 */
export function sniffType(b: Uint8Array): { mime: string; ext: string } | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...b.subarray(start, end));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return { mime: "image/png", ext: "png" };
  if (ascii(0, 4) === "GIF8") return { mime: "image/gif", ext: "gif" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (ascii(0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (ascii(4, 8) === "ftyp" && ["heic", "heix", "hevc", "mif1", "msf1"].includes(ascii(8, 12))) return { mime: "image/heic", ext: "heic" };
  return null;
}

/** Stored names are random, so nothing from the client ever reaches a file path. */
export function saveFile(bytes: Buffer, ext: string): string {
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.mkdirSync(uploadDir(), { recursive: true });
  fs.writeFileSync(path.join(uploadDir(), name), bytes, { flag: "wx" });
  return name;
}

export const filePath = (storedName: string) => path.join(uploadDir(), path.basename(storedName));

export function deleteFile(storedName: string) {
  try { fs.unlinkSync(filePath(storedName)); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.error("[files]", e); }
}
