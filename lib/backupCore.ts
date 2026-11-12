// Backups: a copy of the database every night (the last 7 kept), a download of everything, and restore.
// This file is the same in every app. The app passes in how to copy, check and swap its own database.
import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";

export type BackupConfig = {
  /** Short app name, used in file names. */
  app: string;
  /** Folder the nightly copies go in. */
  dir: string;
  /** The database's name inside a downloaded backup. */
  dbName: string;
  /** Writes a consistent copy of the live database to `dest`. */
  snapshot(dest: string): Promise<void>;
  /** Throws a readable message when `file` isn't this app's database. */
  validate(file: string): void;
  /** Puts `file` in place of the live database. */
  install(file: string): Promise<void>;
  /** A folder of uploaded files that goes in downloads and comes back on restore. */
  files?: { dir: string; prefix: string };
};

const KEEP = 7;
const DAY = 24 * 60 * 60 * 1000;
// To the millisecond, so two copies made close together never share a name.
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);

export type BackupFile = { name: string; size: number; createdAt: string };

/** Nightly copies and the copies made before a restore, newest first. */
export function listBackups(cfg: BackupConfig): BackupFile[] {
  if (!fs.existsSync(cfg.dir)) return [];
  return fs.readdirSync(cfg.dir)
    .filter(n => n.startsWith(`${cfg.app}-`) && n.endsWith(".backup"))
    .map(n => { const s = fs.statSync(path.join(cfg.dir, n)); return { name: n, size: s.size, createdAt: s.mtime.toISOString() }; })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Makes a copy now. `kind` is "nightly", "manual" or "before-restore". */
export async function makeBackup(cfg: BackupConfig, kind = "manual"): Promise<BackupFile> {
  fs.mkdirSync(cfg.dir, { recursive: true });
  const name = `${cfg.app}-${stamp()}-${kind}.backup`;
  const tmp = path.join(cfg.dir, `${name}.tmp`);
  await cfg.snapshot(tmp);
  fs.renameSync(tmp, path.join(cfg.dir, name));
  prune(cfg);
  return listBackups(cfg).find(b => b.name === name)!;
}

/** Keeps the newest 7 of each kind. */
function prune(cfg: BackupConfig) {
  const byKind = new Map<string, BackupFile[]>();
  for (const b of listBackups(cfg)) {
    const kind = b.name.replace(/\.backup$/, "").split("-").pop()!;
    byKind.set(kind, [...(byKind.get(kind) ?? []), b]);
  }
  for (const list of byKind.values()) for (const old of list.slice(KEEP)) fs.rmSync(path.join(cfg.dir, old.name), { force: true });
}

/** Run from the hourly job: makes the nightly copy when the last one is a day old. */
export async function nightlyBackup(cfg: BackupConfig) {
  const last = listBackups(cfg).find(b => b.name.endsWith("-nightly.backup"));
  if (last && Date.now() - new Date(last.createdAt).getTime() < DAY - 60 * 60 * 1000) return;
  await makeBackup(cfg, "nightly");
}

/** Only names this module made, so nothing from a request reaches another path. */
export function backupPath(cfg: BackupConfig, name: string): string | null {
  if (!/^[a-z]+-[\dT-]+-(nightly|manual|before-restore)\.backup$/.test(name)) return null;
  const p = path.join(cfg.dir, name);
  return fs.existsSync(p) ? p : null;
}

// ── tar, the plain ustar kind any computer can open ──

function header(name: string, size: number, mtime: Date): Buffer {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100, "utf8");
  h.write("0000644\0", 100); h.write("0000000\0", 108); h.write("0000000\0", 116);
  h.write(size.toString(8).padStart(11, "0") + "\0", 124);
  h.write(Math.floor(mtime.getTime() / 1000).toString(8).padStart(11, "0") + "\0", 136);
  h.write("        ", 148); h.write("0", 156); h.write("ustar\0" + "00", 257);
  let sum = 0; for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
  return h;
}

/** Everything in one .tar: a fresh copy of the database and the uploaded files. */
export async function downloadStream(cfg: BackupConfig): Promise<{ stream: Readable; filename: string }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `${cfg.app}-dl-`));
  const dbCopy = path.join(tmpDir, cfg.dbName);
  await cfg.snapshot(dbCopy);
  const entries: { name: string; file: string }[] = [{ name: cfg.dbName, file: dbCopy }];
  if (cfg.files && fs.existsSync(cfg.files.dir)) {
    for (const n of fs.readdirSync(cfg.files.dir)) {
      const f = path.join(cfg.files.dir, n);
      if (fs.statSync(f).isFile() && n.length <= 90) entries.push({ name: `${cfg.files.prefix}/${n}`, file: f });
    }
  }
  async function* gen() {
    try {
      for (const e of entries) {
        const st = fs.statSync(e.file);
        yield header(e.name, st.size, st.mtime);
        for await (const chunk of fs.createReadStream(e.file)) yield chunk as Buffer;
        const pad = (512 - (st.size % 512)) % 512;
        if (pad) yield Buffer.alloc(pad);
      }
      yield Buffer.alloc(1024);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
  return { stream: Readable.from(gen()), filename: `${cfg.app}-backup-${new Date().toISOString().slice(0, 10)}.tar` };
}

/** Reads a tar from disk, calling `onFile` for each regular file. */
function readTar(file: string, onFile: (name: string, start: number, size: number) => void) {
  const fd = fs.openSync(file, "r");
  try {
    const total = fs.fstatSync(fd).size;
    const h = Buffer.alloc(512);
    let pos = 0;
    while (pos + 512 <= total) {
      fs.readSync(fd, h, 0, 512, pos);
      if (h.every(b => b === 0)) break;
      const name = h.toString("utf8", 0, 100).replace(/\0.*$/s, "");
      const prefix = h.toString("utf8", 345, 500).replace(/\0.*$/s, "");
      const size = parseInt(h.toString("ascii", 124, 136).replace(/\0.*$/s, "").trim() || "0", 8);
      const type = String.fromCharCode(h[156] || 48);
      if (isNaN(size) || pos + 512 + size > total) throw new Error("That backup file is cut short or damaged.");
      if (type === "0") onFile(prefix ? `${prefix}/${name}` : name, pos + 512, size);
      pos += 512 + Math.ceil(size / 512) * 512;
    }
  } finally { fs.closeSync(fd); }
}

function copyRange(src: string, start: number, size: number, dest: string) {
  const fd = fs.openSync(src, "r"), out = fs.openSync(dest, "w");
  try {
    const buf = Buffer.alloc(1024 * 1024);
    let done = 0;
    while (done < size) {
      const n = fs.readSync(fd, buf, 0, Math.min(buf.length, size - done), start + done);
      if (!n) break;
      fs.writeSync(out, buf, 0, n);
      done += n;
    }
  } finally { fs.closeSync(fd); fs.closeSync(out); }
}

const isTar = (file: string) => {
  const fd = fs.openSync(file, "r");
  try { const b = Buffer.alloc(8); fs.readSync(fd, b, 0, 8, 257); return b.toString("ascii", 0, 5) === "ustar"; }
  finally { fs.closeSync(fd); }
};

/**
 * Restores from a downloaded .tar, a bare database file, or one of the nightly copies. The database is checked
 * before anything changes, and a copy of the current one is made first, so a restore can itself be undone.
 * Uploaded files in the backup are added back; files already here are kept.
 */
export async function restore(cfg: BackupConfig, file: string): Promise<{ files: number }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `${cfg.app}-restore-`));
  try {
    let dbFile = file;
    const extra: { name: string; start: number; size: number }[] = [];
    if (isTar(file)) {
      dbFile = "";
      readTar(file, (name, start, size) => {
        if (name === cfg.dbName) { dbFile = path.join(tmpDir, "db"); copyRange(file, start, size, dbFile); }
        else if (cfg.files && name.startsWith(`${cfg.files.prefix}/`)) {
          const base = name.slice(cfg.files.prefix.length + 1);
          // Plain file names only, so nothing can be written outside the uploads folder.
          if (/^[\w.-]{1,90}$/.test(base) && !base.startsWith(".")) extra.push({ name: base, start, size });
        }
      });
      if (!dbFile) throw new Error(`That backup has no ${cfg.dbName} in it.`);
    } else {
      // Work on a copy, so making the before-restore copy can never touch the file being restored.
      dbFile = path.join(tmpDir, "db");
      fs.copyFileSync(file, dbFile);
    }
    cfg.validate(dbFile);
    await makeBackup(cfg, "before-restore");
    await cfg.install(dbFile);
    let files = 0;
    if (cfg.files) {
      fs.mkdirSync(cfg.files.dir, { recursive: true });
      for (const e of extra) {
        const dest = path.join(cfg.files.dir, e.name);
        if (fs.existsSync(dest)) continue;
        copyRange(file, e.start, e.size, dest);
        files++;
      }
    }
    return { files };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Where an uploaded backup is written while it's checked. Removed by the caller. */
export const uploadTemp = (app: string) => path.join(os.tmpdir(), `${app}-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);

/** Checks a file is an SQLite database before it's opened. */
export function looksLikeSqlite(file: string) {
  const fd = fs.openSync(file, "r");
  try { const b = Buffer.alloc(16); fs.readSync(fd, b, 0, 16, 0); return b.toString("latin1") === "SQLite format 3\0"; }
  finally { fs.closeSync(fd); }
}
