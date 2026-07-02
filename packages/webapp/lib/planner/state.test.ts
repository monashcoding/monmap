import { test } from "node:test"
import assert from "node:assert/strict"

import {
  defaultState,
  historyReducer,
  HISTORY_LIMIT,
  initialHistory,
  plannerReducer,
} from "./state.ts"

test("defaultState: 3 years × 2 primary slots", () => {
  const s = defaultState("2026", "C2000")
  assert.equal(s.years.length, 3)
  for (const y of s.years) {
    assert.equal(y.slots.length, 2)
    assert.deepEqual(
      y.slots.map((sl) => sl.kind),
      ["S1", "S2"]
    )
  }
})

test("add_unit / remove_unit are idempotent for duplicates", () => {
  let s = defaultState("2026", "C2000")
  s = plannerReducer(s, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 0,
    code: "FIT1045",
  })
  s = plannerReducer(s, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 0,
    code: "FIT1045",
  })
  assert.deepEqual(s.years[0].slots[0].unitCodes, ["FIT1045"])

  s = plannerReducer(s, {
    type: "remove_unit",
    yearIndex: 0,
    slotIndex: 0,
    code: "FIT1045",
  })
  s = plannerReducer(s, {
    type: "remove_unit",
    yearIndex: 0,
    slotIndex: 0,
    code: "FIT1045",
  })
  assert.deepEqual(s.years[0].slots[0].unitCodes, [])
})

test("set_course clears AoS selections", () => {
  let s = defaultState("2026", "C2000")
  s = plannerReducer(s, { type: "set_aos", role: "major", code: "SFTWRDEV08" })
  s = plannerReducer(s, { type: "set_course", code: "C2001" })
  assert.deepEqual(s.selectedAos, {})
})

test("set_aos with null code deletes the role", () => {
  let s = defaultState("2026", "C2000")
  s = plannerReducer(s, { type: "set_aos", role: "major", code: "SFTWRDEV08" })
  assert.equal(s.selectedAos.major, "SFTWRDEV08")
  s = plannerReducer(s, { type: "set_aos", role: "major", code: null })
  assert.equal(s.selectedAos.major, undefined)
})

test("set_aos writes component-scoped slot keys and clears superseded legacy keys atomically", () => {
  let s = defaultState("2026", "S2004")
  s = plannerReducer(s, { type: "set_aos", role: "major", code: "BIOCHEM05" })
  s = plannerReducer(s, {
    type: "set_aos",
    role: "major@S2000",
    code: "APPLMTH05",
    alsoClear: ["major"],
  })
  assert.deepEqual(s.selectedAos, { "major@S2000": "APPLMTH05" })
})

test("move_unit removes from source and adds to destination", () => {
  let s = defaultState("2026", "C2000")
  s = plannerReducer(s, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 0,
    code: "FIT1045",
  })
  s = plannerReducer(s, {
    type: "move_unit",
    code: "FIT1045",
    fromYearIndex: 0,
    fromSlotIndex: 0,
    toYearIndex: 1,
    toSlotIndex: 1,
  })
  assert.deepEqual(s.years[0].slots[0].unitCodes, [])
  assert.deepEqual(s.years[1].slots[1].unitCodes, ["FIT1045"])
})

test("add_year labels increment, remove_year relabels remaining", () => {
  let s = defaultState("2026", "C2000", 2)
  s = plannerReducer(s, { type: "add_year" })
  assert.deepEqual(
    s.years.map((y) => y.label),
    ["Year 1", "Year 2", "Year 3"]
  )

  s = plannerReducer(s, { type: "remove_year", yearIndex: 1 })
  assert.deepEqual(
    s.years.map((y) => y.label),
    ["Year 1", "Year 2"]
  )
})

test("remove_year refuses to delete the last year", () => {
  let s = defaultState("2026", "C2000", 1)
  s = plannerReducer(s, { type: "remove_year", yearIndex: 0 })
  assert.equal(s.years.length, 1)
})

test("add_optional_slot appends a new slot; no-op if kind already present", () => {
  let s = defaultState("2026", "C2000")
  s = plannerReducer(s, {
    type: "add_optional_slot",
    yearIndex: 0,
    kind: "SUMMER_A",
  })
  assert.deepEqual(
    s.years[0].slots.map((sl) => sl.kind),
    ["S1", "S2", "SUMMER_A"]
  )
  s = plannerReducer(s, {
    type: "add_optional_slot",
    yearIndex: 0,
    kind: "SUMMER_A",
  })
  assert.equal(s.years[0].slots.length, 3)
})

test("remove_slot: stripping S1 orphans FY twin from S2 of the same year", () => {
  let s = defaultState("2026", "C2000")
  s = plannerReducer(s, {
    type: "add_full_year_unit",
    yearIndex: 0,
    code: "FIT3164",
    fullYearCodes: [],
  })
  // FY twin lands in S1[0] and S2[0] of year 0.
  assert.ok(s.years[0].slots[0].unitCodes.includes("FIT3164"))
  assert.ok(s.years[0].slots[1].unitCodes.includes("FIT3164"))

  s = plannerReducer(s, { type: "remove_slot", yearIndex: 0, slotIndex: 0 })
  // S1 is gone; the surviving S2 has been stripped of the FY twin.
  assert.deepEqual(
    s.years[0].slots.map((sl) => sl.kind),
    ["S2"]
  )
  assert.deepEqual(s.years[0].slots[0].unitCodes, [])
})

test("remove_slot: removing a summer slot leaves S1/S2 untouched", () => {
  let s = defaultState("2026", "C2000")
  s = plannerReducer(s, {
    type: "add_optional_slot",
    yearIndex: 0,
    kind: "SUMMER_A",
  })
  s = plannerReducer(s, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 0,
    code: "FIT1045",
  })
  s = plannerReducer(s, { type: "remove_slot", yearIndex: 0, slotIndex: 2 })
  assert.deepEqual(
    s.years[0].slots.map((sl) => sl.kind),
    ["S1", "S2"]
  )
  assert.deepEqual(s.years[0].slots[0].unitCodes, ["FIT1045"])
})

test("historyReducer: undo / redo round-trips through edits", () => {
  let h = initialHistory(defaultState("2026", "C2000"))
  assert.equal(h.past.length, 0)
  assert.equal(h.future.length, 0)

  h = historyReducer(h, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 0,
    code: "FIT1045",
  })
  h = historyReducer(h, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 1,
    code: "FIT1047",
  })
  assert.deepEqual(h.present.years[0].slots[0].unitCodes, ["FIT1045"])
  assert.deepEqual(h.present.years[0].slots[1].unitCodes, ["FIT1047"])
  assert.equal(h.past.length, 2)

  h = historyReducer(h, { type: "undo" })
  assert.deepEqual(h.present.years[0].slots[1].unitCodes, [])
  assert.equal(h.past.length, 1)
  assert.equal(h.future.length, 1)

  h = historyReducer(h, { type: "redo" })
  assert.deepEqual(h.present.years[0].slots[1].unitCodes, ["FIT1047"])
  assert.equal(h.past.length, 2)
  assert.equal(h.future.length, 0)
})

test("historyReducer: no-op actions don't consume undo depth", () => {
  let h = initialHistory(defaultState("2026", "C2000"))
  h = historyReducer(h, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 0,
    code: "FIT1045",
  })
  // Re-adding the same unit is idempotent at the inner reducer — should
  // not push a new history entry.
  h = historyReducer(h, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 0,
    code: "FIT1045",
  })
  assert.equal(h.past.length, 1)
})

test("historyReducer: hydrate clears history (no cross-plan undo)", () => {
  let h = initialHistory(defaultState("2026", "C2000"))
  h = historyReducer(h, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 0,
    code: "FIT1045",
  })
  h = historyReducer(h, { type: "undo" })
  assert.equal(h.future.length, 1)
  // Loading a new plan must wipe both past and future — otherwise undo
  // could surface state from a different plan.
  const otherPlan = defaultState("2027", "C2001")
  h = historyReducer(h, { type: "hydrate", state: otherPlan })
  assert.equal(h.past.length, 0)
  assert.equal(h.future.length, 0)
  assert.equal(h.present.courseYear, "2027")
})

test("historyReducer: past stack is bounded at HISTORY_LIMIT", () => {
  let h = initialHistory(defaultState("2026", "C2000"))
  // Run more edits than the cap; each toggles different slots so they
  // produce real diffs and aren't deduped.
  for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
    h = historyReducer(h, {
      type: "rename_slot",
      yearIndex: 0,
      slotIndex: 0,
      label: `tick-${i}`,
    })
  }
  assert.equal(h.past.length, HISTORY_LIMIT)
})

test("historyReducer: new edit clears the redo stack", () => {
  let h = initialHistory(defaultState("2026", "C2000"))
  h = historyReducer(h, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 0,
    code: "FIT1045",
  })
  h = historyReducer(h, { type: "undo" })
  assert.equal(h.future.length, 1)
  h = historyReducer(h, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 1,
    code: "FIT1047",
  })
  // Branching off the timeline must drop the orphaned future.
  assert.equal(h.future.length, 0)
})
