import { HttpError, bad, int, route } from "@/lib/api";
import { MAX_UPLOAD_BYTES } from "@/lib/files";
import { addAttachment, listAttachments } from "@/lib/repo/attachments";
import { requireVehicle } from "@/lib/repo/vehicles";

type P = { id: string };

export const GET = route<P>(({ req, user, params }) => {
  const id = requireVehicle(user.id, int(params.id)).id;
  const q = req.nextUrl.searchParams;
  const service = q.get("service");
  const log = q.get("log");
  return listAttachments(id, {
    serviceId: service ? int(service, "service") : undefined,
    buildLogId: log ? int(log, "log") : undefined,
  });
});

export const POST = route<P>(async ({ req, user, params }) => {
  const id = int(params.id);
  // Refuse before reading the body, so an oversized upload can't fill the server's memory.
  // The extra megabyte allows for the multipart wrapping around the file.
  requireVehicle(user.id, id, "edit");
  const length = Number(req.headers.get("content-length"));
  if (!length) throw new HttpError(411, "Upload size is missing");
  if (length > MAX_UPLOAD_BYTES + 1024 * 1024) throw new HttpError(413, "Files can be up to 25 MB");
  const form = await req.formData().catch(() => { throw bad("Upload a file"); });
  return addAttachment(user.id, id, form);
});
