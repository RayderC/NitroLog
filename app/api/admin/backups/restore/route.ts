import fs from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as WebStream } from "stream/web";
import { bad, HttpError, route } from "@/lib/api";
import { backupConfig } from "@/lib/backup";
import { backupPath, restore, uploadTemp } from "@/lib/backupCore";

/** The backup file as the request body, or ?name= for a saved copy. */
export const POST = route(async ({ req }) => {
  const name = req.nextUrl.searchParams.get("name");
  let file: string | null = null, temp = false;
  try {
    if (name) {
      file = backupPath(backupConfig, name);
      if (!file) throw new HttpError(404, "Backup not found");
    } else {
      if (!req.body) throw bad("Choose a backup file");
      file = uploadTemp(backupConfig.app); temp = true;
      await pipeline(Readable.fromWeb(req.body as unknown as WebStream), fs.createWriteStream(file));
      if (fs.statSync(file).size < 512) throw bad("That file is empty");
    }
    try {
      return { ok: true, ...(await restore(backupConfig, file)) };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw bad((e as Error).message);
    }
  } finally {
    if (temp && file) fs.rmSync(file, { force: true });
  }
}, { admin: true });
