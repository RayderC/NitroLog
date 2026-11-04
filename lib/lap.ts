// Lap times are stored as whole milliseconds. No imports, so this runs under `node --test`.

/** Accepts "1:32.456", "92.456", "1:32" and "1:02:03.5". Returns null when it can't be read. */
export function parseLap(input: string): number | null {
  const t = input.trim();
  if (!/^\d+(:\d{1,2}){0,2}(\.\d{1,3})?$/.test(t)) return null;
  const [whole, fraction = ""] = t.split(".");
  const parts = whole.split(":").map(Number);
  if (parts.slice(1).some(n => n >= 60)) return null;
  const seconds = parts.reduce((total, n) => total * 60 + n, 0);
  return seconds * 1000 + Number(fraction.padEnd(3, "0") || 0);
}

export function fmtLap(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor(ms / 1000) % 60;
  const millis = ms % 1000;
  const tail = `${String(seconds).padStart(minutes ? 2 : 1, "0")}.${String(millis).padStart(3, "0")}`;
  return minutes ? `${minutes}:${tail}` : tail;
}
