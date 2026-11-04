import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, computeDue } from "./due.ts";

const base = { current: 10_000, lastReading: 5_000, lastDate: "2026-01-01", intervalReading: 10_000, intervalMonths: 12, today: "2026-02-01" };

test("ok when both limits are far away", () => {
  const r = computeDue(base);
  assert.equal(r.status, "ok");
  assert.equal(r.remaining, 5_000);
  assert.equal(r.dueDate, "2027-01-01");
});

test("overdue when the reading passes even if the date has not", () => {
  const r = computeDue({ ...base, current: 15_001 });
  assert.equal(r.status, "overdue");
  assert.equal(r.remaining, -1);
});

test("overdue when the date passes even if the reading has not", () => {
  assert.equal(computeDue({ ...base, today: "2027-01-02" }).status, "overdue");
});

test("exactly at the limit counts as overdue", () => {
  assert.equal(computeDue({ ...base, current: 15_000 }).status, "overdue");
  assert.equal(computeDue({ ...base, today: "2027-01-01" }).status, "overdue");
});

test("soon inside the last 10% of the reading interval", () => {
  assert.equal(computeDue({ ...base, current: 14_000 }).status, "soon");
  assert.equal(computeDue({ ...base, current: 13_999 }).status, "ok");
});

test("soon inside the last 30 days", () => {
  assert.equal(computeDue({ ...base, today: "2026-12-02" }).status, "soon");
  assert.equal(computeDue({ ...base, today: "2026-12-01" }).status, "ok");
});

test("a time-only item ignores the odometer", () => {
  const r = computeDue({ ...base, intervalReading: null, current: 9_999_999 });
  assert.equal(r.status, "ok");
  assert.equal(r.remaining, null);
});

test("a reading-only item with no odometer yet is unknown, not ok", () => {
  assert.equal(computeDue({ ...base, intervalMonths: null, current: null }).status, "unknown");
  assert.equal(computeDue({ ...base, intervalMonths: null, lastReading: null }).status, "unknown");
});

test("missing odometer falls back to the date limit", () => {
  assert.equal(computeDue({ ...base, current: null, today: "2027-02-01" }).status, "overdue");
});

test("addMonths clamps to the end of shorter months and crosses years", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2026-11-15", 3), "2027-02-15");
  assert.equal(addMonths("2026-06-30", 24), "2028-06-30");
});
