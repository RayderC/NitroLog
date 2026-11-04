import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtEconomy, fromLiters, readingFromInput, readingToInput, toCents, toLiters } from "./units.ts";

test("a typed odometer value comes back unchanged in either unit", () => {
  for (const du of ["mi", "km"] as const) {
    for (const v of [0, 1, 5000, 123_456, 999_999]) {
      assert.equal(readingToInput(readingFromInput(v, "distance", du), "distance", du), v);
    }
  }
});

test("engine hours are stored as hours and shown to one decimal", () => {
  assert.equal(readingFromInput(12.5, "hours", "mi"), 12.5);
  assert.equal(readingToInput(12.46, "hours", "km"), 12.5);
});

test("gallons round trip", () => {
  assert.ok(Math.abs(fromLiters(toLiters(14.2, "gal"), "gal") - 14.2) < 1e-9);
});

test("money does not pick up floating point cents", () => {
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(1.1), 110);
});

test("economy formats", () => {
  // 30 mpg in meters per liter
  const mpl = (30 * 1609.344) / 3.785411784;
  assert.equal(fmtEconomy(mpl, "mi", "gal"), "30.0 mpg");
  assert.equal(fmtEconomy(mpl, "km", "L"), "7.8 L/100 km");
  assert.equal(fmtEconomy(null, "mi", "gal"), "—");
});
