import { db } from "./db";

/** Server-wide settings an admin sets in the app, such as optional service keys. */
export function getSetting(key: string): string | null {
  const r = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return r?.value ?? null;
}

export function setSetting(key: string, value: string | null) {
  if (value === null) db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  else db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

/** The end of a secret, enough to recognise it without showing it. */
export const keyHint = (v: string | null | undefined) => (v ? v.slice(-4) : null);
