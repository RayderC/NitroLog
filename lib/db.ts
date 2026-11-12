import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8, SCHEMA_V9 } from "./schema";

export const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "nitrolog.db");

function open(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

const MIGRATIONS: ((db: Database.Database) => void)[] = [
  db => { db.exec(SCHEMA_V1); },
  db => { db.exec(SCHEMA_V2); },
  db => { db.exec(SCHEMA_V3); },
  db => { db.exec(SCHEMA_V4); },
  db => { db.exec(SCHEMA_V5); },
  db => { db.exec(SCHEMA_V6); },
  db => { db.exec(SCHEMA_V7); },
  db => { db.exec(SCHEMA_V8); },
  db => { db.exec(SCHEMA_V9); },
];

/** The schema version this build knows. A backup from a newer build can't be restored into it. */
export const SCHEMA_VERSION = MIGRATIONS.length;

function migrate(db: Database.Database) {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      MIGRATIONS[v](db);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

const g = globalThis as unknown as { __nitrologDb?: Database.Database };

/** Closes the database so a restore can swap the file. The next query opens it again. */
export function closeDb() {
  g.__nitrologDb?.close();
  g.__nitrologDb = undefined;
}

/**
 * Opens on first use, not on import. `next build` imports every route in parallel workers, and opening
 * there makes them race to switch one new file to WAL mode, failing the build with SQLITE_BUSY.
 */
export const db = new Proxy({} as Database.Database, {
  get(_target, prop) {
    const real = g.__nitrologDb ?? (g.__nitrologDb = open());
    const value = Reflect.get(real, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
