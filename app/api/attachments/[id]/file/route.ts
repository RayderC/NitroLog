import fs from "fs/promises";
import { int, notFound, route } from "@/lib/api";
import { filePath } from "@/lib/files";
import { attachmentForDownload } from "@/lib/repo/attachments";

/** Files are private to whoever can see the vehicle, so they're served here and never from public/. */
export const GET = route<{ id: string }>(async ({ req, user, params }) => {
  const a = attachmentForDownload(user.id, int(params.id));
  const bytes = await fs.readFile(filePath(a.stored_name)).catch(() => { throw notFound("File is missing from storage"); });
  const download = req.nextUrl.searchParams.has("download");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": a.mime,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
});
