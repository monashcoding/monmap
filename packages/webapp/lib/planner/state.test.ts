import { test } from "node:test";
import assert from "node:assert/strict";

import { defaultState, plannerReducer } from "./state.ts";

test("defaultState: 3 years × 2 primary slots", () => {
  const s = defaultState("2026", "C2000");
  assert.equal(s.years.length, 3);
  for (const y of s.years) {
    assert.equal(y.slots.length, 2);
    assert.deepEqual(
      y.slots.map((sl) => sl.kind),
      ["S1", "S2"],
    );
  }
});

test("add_unit / remove_unit are idempotent for duplicates", () => {
  let s = defaultState("2026", "C2000");
  s = plannerReducer(s, { type: "add_unit", yearIndex: 0, slotIndex: 0, code: "FIT1045" });
  s = plannerReducer(s, { type: "add_unit", yearIndex: 0, slotIndex: 0, code: "FIT1045" });
  assert.deepEqual(s.years[0].slots[0].unitCodes, ["FIT1045"]);

  s = plannerReducer(s, { type: "remove_unit", yearIndex: 0, slotIndex: 0, code: "FIT1045" });
  s = plannerReducer(s, { type: "remove_unit", yearIndex: 0, slotIndex: 0, code: "FIT1045" });
  assert.deepEqual(s.years[0].slots[0].unitCodes, []);
});

test("set_course clears AoS selections", () => {
  let s = defaultState("2026", "C2000");
  s = plannerReducer(s, { type: "set_aos", role: "major", code: "SFTWRDEV08" });
  s = plannerReducer(s, { type: "set_course", code: "C2001" });
  assert.deepEqual(s.selectedAos, {});
});

test("set_aos with null code deletes the role", () => {
  let s = defaultState("2026", "C2000");
  s = plannerReducer(s, { type: "set_aos", role: "major", code: "SFTWRDEV08" });
  assert.equal(s.selectedAos.major, "SFTWRDEV08");
  s = plannerReducer(s, { type: "set_aos", role: "major", code: null });
  assert.equal(s.selectedAos.major, undefined);
});

test("move_unit removes from source and adds to destination", () => {
  let s = defaultState("2026", "C2000");
  s = plannerReducer(s, { type: "add_unit", yearIndex: 0, slotIndex: 0, code: "FIT1045" });
  s = plannerReducer(s, {
    type: "move_unit",
    code: "FIT1045",
    fromYearIndex: 0,
    fromSlotIndex: 0,
    toYearIndex: 1,
    toSlotIndex: 1,
  });
  assert.deepEqual(s.years[0].slots[0].unitCodes, []);
  assert.deepEqual(s.years[1].slots[1].unitCodes, ["FIT1045"]);
});

test("add_year labels increment, remove_year relabels remaining", () => {
  let s = defaultState("2026", "C2000", 2);
  s = plannerReducer(s, { type: "add_year" });
  assert.deepEqual(s.years.map((y) => y.label), ["Year 1", "Year 2", "Year 3"]);

  s = plannerReducer(s, { type: "remove_year", yearIndex: 1 });
  assert.deepEqual(s.years.map((y) => y.label), ["Year 1", "Year 2"]);
});

test("remove_year refuses to delete the last year", () => {
  let s = defaultState("2026", "C2000", 1);
  s = plannerReducer(s, { type: "remove_year", yearIndex: 0 });
  assert.equal(s.years.length, 1);
});

test("add_optional_slot appends a new slot; no-op if kind already present", () => {
  let s = defaultState("2026", "C2000");
  s = plannerReducer(s, { type: "add_optional_slot", yearIndex: 0, kind: "SUMMER_A" });
  assert.deepEqual(
    s.years[0].slots.map((sl) => sl.kind),
    ["S1", "S2", "SUMMER_A"],
  );
  s = plannerReducer(s, { type: "add_optional_slot", yearIndex: 0, kind: "SUMMER_A" });
  assert.equal(s.years[0].slots.length, 3);
});
