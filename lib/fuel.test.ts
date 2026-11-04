import { test } from "node:test";
import assert from "node:assert/strict";
import { computeEconomy } from "./fuel.ts";

test("measures between consecutive full tanks", () => {
  const e = computeEconomy([
    { id: 1, reading: 1000, volumeL: 40, fullTank: true },
    { id: 2, reading: 1500, volumeL: 50, fullTank: true },
  ]);
  assert.equal(e.byId[1], undefined);
  assert.equal(e.byId[2], 10);
  assert.equal(e.average, 10);
});

test("partial fills add to the next full-tank measurement", () => {
  const e = computeEconomy([
    { id: 1, reading: 1000, volumeL: 40, fullTank: true },
    { id: 2, reading: 1200, volumeL: 10, fullTank: false },
    { id: 3, reading: 1600, volumeL: 30, fullTank: true },
  ]);
  assert.equal(e.byId[2], undefined);
  assert.equal(e.byId[3], 15);
});

test("order of input does not matter, and fills without a reading are skipped", () => {
  const e = computeEconomy([
    { id: 2, reading: 1500, volumeL: 50, fullTank: true },
    { id: 9, reading: null, volumeL: 99, fullTank: true },
    { id: 1, reading: 1000, volumeL: 40, fullTank: true },
  ]);
  assert.equal(e.byId[2], 10);
});

test("no economy until there are two full tanks", () => {
  assert.equal(computeEconomy([{ id: 1, reading: 1000, volumeL: 40, fullTank: true }]).average, null);
  assert.equal(computeEconomy([]).average, null);
});
