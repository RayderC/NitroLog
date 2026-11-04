import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAmount, parseCsv, parseDay } from "./csv.ts";
import { fmtLap, parseLap } from "./lap.ts";
import { decidePush, pushMessage, type PushItem } from "./pushLogic.ts";

test("csv handles quotes, newlines in quotes, CRLF, BOM and blank lines", () => {
  assert.deepEqual(parseCsv('﻿date,title\r\n2026-01-01,"Oil, filter"\r\n\r\n2026-02-01,"He said ""go""\nnow"\r\n'), [
    ["date", "title"], ["2026-01-01", "Oil, filter"], ["2026-02-01", 'He said "go"\nnow'],
  ]);
});

test("csv detects semicolons and tabs and handles a missing final newline", () => {
  assert.deepEqual(parseCsv("a;b\n1,5;2"), [["a", "b"], ["1,5", "2"]]);
  assert.deepEqual(parseCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
});

test("dates read in the chosen order and impossible dates fail", () => {
  assert.equal(parseDay("2026-03-04", "ymd"), "2026-03-04");
  assert.equal(parseDay("3/4/2026", "mdy"), "2026-03-04");
  assert.equal(parseDay("4/3/2026", "dmy"), "2026-03-04");
  assert.equal(parseDay("3/4/26", "mdy"), "2026-03-04");
  assert.equal(parseDay("2/31/2026", "mdy"), null);
  assert.equal(parseDay("13/1/2026", "mdy"), null);
  assert.equal(parseDay("soon", "mdy"), null);
});

test("amounts read in US and European formats", () => {
  assert.equal(parseAmount("$1,234.50"), 1234.5);
  assert.equal(parseAmount("1.234,50"), 1234.5);
  assert.equal(parseAmount("84,000"), 84000);
  assert.equal(parseAmount("45,5"), 45.5);
  assert.equal(parseAmount("45"), 45);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("n/a"), null);
});

test("lap times parse and format", () => {
  assert.equal(parseLap("1:32.456"), 92456);
  assert.equal(parseLap("92.456"), 92456);
  assert.equal(parseLap("1:32"), 92000);
  assert.equal(parseLap("1:32.5"), 92500);
  assert.equal(parseLap("1:60"), null);
  assert.equal(parseLap("fast"), null);
  assert.equal(fmtLap(92456), "1:32.456");
  assert.equal(fmtLap(59001), "59.001");
  assert.equal(fmtLap(60000), "1:00.000");
  assert.equal(fmtLap(null), "—");
});

const item = (id: number, status: PushItem["status"]): PushItem => ({ id, name: `Item ${id}`, vehicleName: "Car", status });

test("push tells you once when an item becomes due soon", () => {
  assert.equal(decidePush([item(1, "soon")], new Map(), "2026-06-01").notify.length, 1);
  const sent = new Map([[1, { status: "soon", sentOn: "2026-05-01" }]]);
  assert.equal(decidePush([item(1, "soon")], sent, "2026-06-01").notify.length, 0);
});

test("push tells you again when soon becomes overdue, then every 14 days", () => {
  const soon = new Map([[1, { status: "soon", sentOn: "2026-06-01" }]]);
  assert.equal(decidePush([item(1, "overdue")], soon, "2026-06-02").notify.length, 1);
  const overdue = (on: string) => new Map([[1, { status: "overdue", sentOn: on }]]);
  assert.equal(decidePush([item(1, "overdue")], overdue("2026-06-01"), "2026-06-14").notify.length, 0);
  assert.equal(decidePush([item(1, "overdue")], overdue("2026-06-01"), "2026-06-15").notify.length, 1);
});

test("an item back to ok is forgotten and never notifies", () => {
  const sent = new Map([[1, { status: "overdue", sentOn: "2026-06-01" }]]);
  const r = decidePush([item(1, "ok"), item(2, "ok")], sent, "2026-06-02");
  assert.deepEqual(r.notify, []);
  assert.deepEqual(r.clear, [1]);
});

test("message wording", () => {
  assert.equal(pushMessage([item(1, "overdue")]).title, "Item 1: overdue");
  assert.equal(pushMessage([item(1, "soon")]).title, "Item 1: due soon");
  const many = pushMessage([1, 2, 3, 4, 5].map(i => item(i, i === 1 ? "overdue" : "soon")));
  assert.equal(many.title, "5 services need attention (1 overdue)");
  assert.match(many.body, /and 1 more$/);
});
