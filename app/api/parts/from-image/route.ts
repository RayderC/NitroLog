import { HttpError, bad, route } from "@/lib/api";
import { sniffType } from "@/lib/files";
import { readPartsImage } from "@/lib/gemini";
import { checkRateLimit } from "@/lib/rateLimit";

/** Pictures Gemini can read. HEIC is what iPhones take photos in. */
const READABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Reads parts off a screenshot of a product page or order, or a photo of a receipt. The picture goes to Gemini
 * and is not kept: nothing is saved on the server.
 */
export const POST = route(async ({ req, user }) => {
  // Refuse before reading the body, so an oversized upload can't fill the server's memory.
  const length = Number(req.headers.get("content-length"));
  if (!length) throw new HttpError(411, "Upload size is missing");
  if (length > MAX_BYTES + 512 * 1024) throw new HttpError(413, "Pictures can be up to 12 MB. Crop it, or take a screenshot instead of a photo.");
  if (!checkRateLimit(`photo:${user.id}`, 15, 10 * 60_000)) throw new HttpError(429, "That's a lot of pictures at once. Try again in a few minutes.");
  const form = await req.formData().catch(() => { throw bad("Choose a picture"); });
  const file = form.get("image");
  if (!(file instanceof Blob) || file.size === 0) throw bad("Choose a picture");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Pictures can be up to 12 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniffType(bytes);
  if (!type || !READABLE.has(type.mime)) throw bad("That isn't a picture NitroLog can read. Use a screenshot or a JPEG or PNG photo.");
  const read = await readPartsImage(bytes, type.mime);
  return {
    store: read.store,
    parts: read.parts.map(p => ({ ...p, store: read.store ?? "your picture", named: true, from: "photo" as const, url: p.url ?? "" })),
  };
});
