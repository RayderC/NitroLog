// NitroLog's backups: the database plus uploaded photos and documents. See lib/backupCore.ts.
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { closeDb, db, DB_PATH, SCHEMA_VERSION } from "./db";
import { looksLikeSqlite, type BackupConfig } from "./backupCore";
import { uploadDir } from "./files";

export const backupConfig: BackupConfig = {
  app: "nitrolog",
  dir: process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), "backups"),
  dbName: "nitrolog.db",
  files: { dir: uploadDir(), prefix: "uploads" },
  async snapshot(dest) { await db.backup(dest); },
  validate(file) {
    if (!looksLikeSqlite(file)) throw new Error("That isn't a NitroLog backup.");
    const test = new Database(file, { readonly: true, fileMustExist: true });
    try {
      if ((test.pragma("quick_check", { simple: true }) as string) !== "ok") throw new Error("That backup is damaged.");
      const has = test.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'vehicles', 'service_records')").all().length;
      if (has < 3) throw new Error("That isn't a NitroLog backup.");
      const v = test.pragma("user_version", { simple: true }) as number;
      if (v > SCHEMA_VERSION) throw new Error("That backup is from a newer NitroLog. Update this one first.");
      if (!(test.prepare("SELECT COUNT(*) n FROM users WHERE is_admin = 1 AND disabled = 0").get() as { n: number }).n) {
        throw new Error("That backup has no admin account, so nobody could manage it.");
      }
    } finally { test.close(); }
  },
  async install(file) {
    closeDb();
    const tmp = `${DB_PATH}.restoring`;
    fs.copyFileSync(file, tmp);
    for (const ext of ["-wal", "-shm"]) fs.rmSync(DB_PATH + ext, { force: true });
    fs.renameSync(tmp, DB_PATH);
  },
};
