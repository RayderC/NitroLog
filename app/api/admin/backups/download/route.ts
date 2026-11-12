import fs from "fs";
import { Readable } from "stream";
import { HttpError, route } from "@/lib/api";
import { backupConfig } from "@/lib/backup";
import { backupPath, downloadStream } from "@/lib/backupCore";

/** No name: everything as a .tar. With ?name=: one of the saved copies (the database only). */
export const GET = route(async ({ req }) => {
  const name = req.nextUrl.searchParams.get("name");
  if (name) {
    const p = backupPath(backupConfig, name);
    if (!p) throw new HttpError(404, "Backup not found");
    return new Response(Readable.toWeb(fs.createReadStream(p)) as ReadableStream, {
      headers: {
        "Content-Type": "application/octet-stream", "Content-Length": String(fs.statSync(p).size),
        "Content-Disposition": `attachment; filename="${name.replace(/\.backup$/, ".db")}"`,
      },
    });
  }
  const { stream, filename } = await downloadStream(backupConfig);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: { "Content-Type": "application/x-tar", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}, { admin: true });
