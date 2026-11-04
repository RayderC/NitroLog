// CSV parsing for the importer. No imports, so this runs under `node --test`.

/** RFC 4180 parser: quoted fields, doubled quotes, newlines inside quotes, CRLF and a leading BOM. Auto-detects comma, semicolon or tab. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(x => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(x => x.trim() !== "")) rows.push(row);
  return rows;
}

export type DateOrder = "ymd" | "mdy" | "dmy";

/** Reads a date in the chosen order, with any separator. Two-digit years mean 20xx. Rejects dates that don't exist. */
export function parseDay(input: string, order: DateOrder): string | null {
  const parts = input.trim().split(/[^\d]+/).filter(Boolean).slice(0, 3);
  if (parts.length !== 3) return null;
  const [a, b, c] = parts.map(Number);
  let [y, m, d] = order === "ymd" ? [a, b, c] : order === "mdy" ? [c, a, b] : [c, b, a];
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/** Reads "$1,234.50", "1.234,50" and "45" as numbers. Blank or unreadable gives null. */
export function parseAmount(input: string): number | null {
  let t = input.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(t)) return null;
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  if (lastComma > lastDot) {
    // A comma followed by exactly three digits with no dot is a thousands separator, as in 84,000.
    t = lastDot === -1 && /,\d{3}$/.test(t) ? t.replace(/,/g, "") : t.replace(/\./g, "").replace(",", ".");
  } else t = t.replace(/,/g, "");
  const n = Number(t);
  return isFinite(n) ? n : null;
}
