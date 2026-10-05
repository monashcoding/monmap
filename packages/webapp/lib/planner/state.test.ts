import { test } from "node:test"
import assert from "node:assert/strict"

import {
  defaultState,
  historyReducer,
  HISTORY_LIMIT,
  initialHistory,
  plannerReducer,
  type PlannerAction,
} from "./state.ts"
import { planState } from "./test-fixtures.ts"
import type { PlannerState } from "./types.ts"

/** Each slot's units, year by year. */
const grid = (s: PlannerState) =>
  s.years.map((y) => y.slots.map((sl) => sl.unitCodes))

const apply = (s: PlannerState, ...actions: PlannerAction[]) =>
  actions.reduce(plannerReducer, s)

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

test("add_full_year_unit: a retake in a later year is allowed", () => {
  // Failing a full-year unit and taking it again next year is
  // legitimate; only a second copy inside the SAME year is a mistake
  // (an FY unit already occupies both semesters of one year).
  let s = defaultState("2026", "C2000")
  s = plannerReducer(s, {
    type: "add_full_year_unit",
    yearIndex: 0,
    code: "FIT3164",
    fullYearCodes: [],
  })
  s = plannerReducer(s, {
    type: "add_full_year_unit",
    yearIndex: 1,
    code: "FIT3164",
    fullYearCodes: [],
  })
  assert.ok(s.years[1].slots[0].unitCodes.includes("FIT3164"))
  assert.ok(s.years[1].slots[1].unitCodes.includes("FIT3164"))

  // Same year twice is still a no-op.
  const before = s
  s = plannerReducer(s, {
    type: "add_full_year_unit",
    yearIndex: 1,
    code: "FIT3164",
    fullYearCodes: [],
  })
  assert.equal(s, before)
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

/* ------------------------------------------------------------------ *
 * Advanced standing
 * ------------------------------------------------------------------ */

test("add_credit: records specified and block credit side by side", () => {
  let s = defaultState("2026", "C2000")
  s = plannerReducer(s, {
    type: "add_credit",
    entry: { code: "FIT1045", creditPoints: 6, label: "VCE Algorithmics" },
  })
  s = plannerReducer(s, {
    type: "add_credit",
    entry: { code: null, creditPoints: 24, label: "Deakin transfer" },
  })
  assert.equal(s.credit?.length, 2)
  assert.equal(s.credit?.[0]?.code, "FIT1045")
  assert.equal(s.credit?.[1]?.code, null)
})

test("add_credit: the same unit can't be credited twice", () => {
  let s = defaultState("2026", "C2000")
  s = plannerReducer(s, {
    type: "add_credit",
    entry: { code: "FIT1045", creditPoints: 6 },
  })
  const before = s
  s = plannerReducer(s, {
    type: "add_credit",
    entry: { code: "FIT1045", creditPoints: 6 },
  })
  assert.equal(s, before)
  // Block credit has no code, so it never collides with itself.
  s = plannerReducer(s, {
    type: "add_credit",
    entry: { code: null, creditPoints: 6 },
  })
  s = plannerReducer(s, {
    type: "add_credit",
    entry: { code: null, creditPoints: 6 },
  })
  assert.equal(s.credit?.length, 3)
})

test("add_credit: crediting a unit already placed in the plan is ignored", () => {
  // Contradictory: the placement is the more specific statement, and
  // counting both would double its credit points.
  let s = defaultState("2026", "C2000")
  s = plannerReducer(s, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 0,
    code: "FIT1045",
  })
  const before = s
  s = plannerReducer(s, {
    type: "add_credit",
    entry: { code: "FIT1045", creditPoints: 6 },
  })
  assert.equal(s, before)
})

test("remove_credit: drops by index and ignores out-of-range", () => {
  let s = defaultState("2026", "C2000")
  s = plannerReducer(s, {
    type: "add_credit",
    entry: { code: "A1000", creditPoints: 6 },
  })
  s = plannerReducer(s, {
    type: "add_credit",
    entry: { code: "B1000", creditPoints: 6 },
  })
  s = plannerReducer(s, { type: "remove_credit", index: 0 })
  assert.deepEqual(
    s.credit?.map((c) => c.code),
    ["B1000"]
  )
  const before = s
  assert.equal(plannerReducer(s, { type: "remove_credit", index: 9 }), before)
})

/* ------------------------------------------------------------------ *
 * set_campus — docs/plan-multiple-aos.md §4
 * ------------------------------------------------------------------ */

test("set_campus stores the campus", () => {
  const s = plannerReducer(defaultState("2026", "E3001"), {
    type: "set_campus",
    campus: "Malaysia",
  })
  assert.equal(s.campus, "Malaysia")
})

test("set_campus with null removes the key rather than storing null", () => {
  // The field is optional; a literal null would serialise into every
  // saved plan and read differently from "never set".
  const withCampus = plannerReducer(defaultState("2026", "E3001"), {
    type: "set_campus",
    campus: "Clayton",
  })
  const cleared = plannerReducer(withCampus, {
    type: "set_campus",
    campus: null,
  })
  assert.equal(cleared.campus, undefined)
  assert.ok(!("campus" in cleared))
})

test("set_campus to the current value is a no-op by identity", () => {
  const s = plannerReducer(defaultState("2026", "E3001"), {
    type: "set_campus",
    campus: "Clayton",
  })
  assert.equal(
    plannerReducer(s, { type: "set_campus", campus: "Clayton" }),
    s,
    "same value must not produce a new object (avoids a re-render)"
  )
})

test("clearing an already-unset campus is a no-op by identity", () => {
  const s = defaultState("2026", "E3001")
  assert.equal(plannerReducer(s, { type: "set_campus", campus: null }), s)
})

test("set_campus NEVER clears selectedAos", () => {
  // Plan §4: a pick that falls out of scope is flagged in the picker,
  // not deleted — clearing it would silently discard the student's
  // decision.
  const base = plannerReducer(defaultState("2026", "E3001"), {
    type: "set_aos",
    role: "minor",
    code: "MALMNR01",
  })
  const switched = plannerReducer(base, {
    type: "set_campus",
    campus: "Clayton",
  })
  assert.deepEqual(switched.selectedAos, { minor: "MALMNR01" })
})

test("set_campus leaves years and credit untouched", () => {
  const base = defaultState("2026", "E3001")
  base.years[0]!.slots[0]!.unitCodes = ["ENG1001"]
  base.credit = [{ code: "FIT1045", creditPoints: 6 }]
  const s = plannerReducer(base, { type: "set_campus", campus: "Clayton" })
  assert.deepEqual(s.years[0]!.slots[0]!.unitCodes, ["ENG1001"])
  assert.deepEqual(s.credit, [{ code: "FIT1045", creditPoints: 6 }])
})

/* ------------------------------------------------------------------ *
 * Full-year units
 * ------------------------------------------------------------------ */

/** Year 1 with FY units A and B at the front of both semesters. */
const twoFullYear = () =>
  planState([
    { S1: ["A", "B", "X"], S2: ["A", "B", "Y"] },
    { S1: [], S2: [] },
  ])

test("add_full_year_unit inserts after the existing FY prefix", () => {
  const s = apply(twoFullYear(), {
    type: "add_full_year_unit",
    yearIndex: 0,
    code: "C",
    fullYearCodes: ["A", "B"],
  })
  assert.deepEqual(grid(s)[0], [
    ["A", "B", "C", "X"],
    ["A", "B", "C", "Y"],
  ])
})

test("remove_full_year_unit strips both halves; a missing code is a no-op", () => {
  const before = twoFullYear()
  const s = apply(before, { type: "remove_full_year_unit", code: "A" })
  assert.deepEqual(grid(s)[0], [
    ["B", "X"],
    ["B", "Y"],
  ])
  assert.equal(
    plannerReducer(before, { type: "remove_full_year_unit", code: "Z" }),
    before
  )
})

test("remove_full_year_unit with a yearIndex keeps a retake in another year", () => {
  const s = apply(
    twoFullYear(),
    {
      type: "add_full_year_unit",
      yearIndex: 1,
      code: "A",
      fullYearCodes: ["A", "B"],
    },
    { type: "remove_full_year_unit", code: "A", yearIndex: 0 }
  )
  assert.deepEqual(grid(s), [
    [
      ["B", "X"],
      ["B", "Y"],
    ],
    [["A"], ["A"]],
  ])
})

test("move_full_year_unit moves both halves to the target year's prefix", () => {
  let s = planState([
    { S1: ["A", "X"], S2: ["A", "Y"] },
    { S1: ["B", "P"], S2: ["B", "Q"] },
  ])
  s = apply(s, {
    type: "move_full_year_unit",
    fromYearIndex: 0,
    toYearIndex: 1,
    code: "A",
    fullYearCodes: ["A", "B"],
  })
  assert.deepEqual(grid(s), [
    [["X"], ["Y"]],
    [
      ["B", "A", "P"],
      ["B", "A", "Q"],
    ],
  ])
})

test("move_full_year_unit in one year reorders in one step", () => {
  // B dropped on A takes A's place, in both halves.
  const s = apply(twoFullYear(), {
    type: "move_full_year_unit",
    fromYearIndex: 0,
    toYearIndex: 0,
    code: "B",
    targetCode: "A",
    fullYearCodes: ["A", "B"],
  })
  assert.deepEqual(grid(s)[0], [
    ["B", "A", "X"],
    ["B", "A", "Y"],
  ])

  // One undo restores the original order.
  let h = initialHistory(twoFullYear())
  h = historyReducer(h, {
    type: "move_full_year_unit",
    fromYearIndex: 0,
    toYearIndex: 0,
    code: "B",
    targetCode: "A",
    fullYearCodes: ["A", "B"],
  })
  h = historyReducer(h, { type: "undo" })
  assert.deepEqual(grid(h.present), grid(twoFullYear()))
})

test("a same-year FY reorder leaves a retake in another year alone", () => {
  let s = apply(twoFullYear(), {
    type: "add_full_year_unit",
    yearIndex: 1,
    code: "A",
    fullYearCodes: ["A", "B"],
  })
  s = apply(s, {
    type: "move_full_year_unit",
    fromYearIndex: 0,
    toYearIndex: 0,
    code: "A",
    fullYearCodes: ["A", "B"],
  })
  // Without a target, A goes to the end of the FY prefix.
  assert.deepEqual(grid(s), [
    [
      ["B", "A", "X"],
      ["B", "A", "Y"],
    ],
    [["A"], ["A"]],
  ])
})

test("a same-year FY reorder onto a non-FY unit stays in the FY prefix", () => {
  const s = apply(twoFullYear(), {
    type: "move_full_year_unit",
    fromYearIndex: 0,
    toYearIndex: 0,
    code: "A",
    targetCode: "X",
    fullYearCodes: ["A", "B"],
  })
  assert.deepEqual(grid(s)[0], [
    ["B", "A", "X"],
    ["B", "A", "Y"],
  ])
})

test("move_full_year_unit refuses a target year with a leave semester", () => {
  const before = apply(twoFullYear(), {
    type: "set_slot_status",
    yearIndex: 1,
    slotIndex: 1,
    status: "leave",
  })
  const s = plannerReducer(before, {
    type: "move_full_year_unit",
    fromYearIndex: 0,
    toYearIndex: 1,
    code: "A",
    fullYearCodes: ["A", "B"],
  })
  assert.equal(s, before)
})

test("heal_full_year_unit twins a half-placed unit in one undo-free step", () => {
  // FY1 was added to S1 before its offerings said it was full-year.
  const start = planState([
    { S1: ["X"], S2: ["Y"] },
    { S1: ["FY1"], S2: [] },
  ])
  let h = initialHistory(start)
  h = historyReducer(h, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 0,
    code: "FY2",
  })
  h = historyReducer(h, {
    type: "heal_full_year_unit",
    yearIndex: 0,
    code: "FY2",
    fullYearCodes: ["FY1"],
  })
  assert.deepEqual(grid(h.present)[0], [
    ["FY2", "X"],
    ["FY2", "Y"],
  ])
  assert.equal(h.past.length, 1, "the repair takes no undo slot")

  // One undo goes back to before the add, not to a half-placed state.
  const undone = historyReducer(h, { type: "undo" })
  assert.deepEqual(grid(undone.present), grid(start))

  // Healing a unit that is already twinned changes nothing.
  assert.equal(
    historyReducer(h, {
      type: "heal_full_year_unit",
      yearIndex: 0,
      code: "FY2",
      fullYearCodes: ["FY1"],
    }),
    h
  )
})

test("heal_full_year_unit leaves a retake, a removed unit and a leave half alone", () => {
  let s = planState([
    { S1: ["FY"], S2: ["FY"] },
    { S1: ["FY"], S2: [] },
  ])
  s = apply(s, {
    type: "heal_full_year_unit",
    yearIndex: 1,
    code: "FY",
    fullYearCodes: [],
  })
  assert.deepEqual(grid(s), [
    [["FY"], ["FY"]],
    [["FY"], ["FY"]],
  ])

  // A unit the student has since removed is not brought back.
  const removed = planState([{ S1: ["X"], S2: ["Y"] }])
  assert.equal(
    plannerReducer(removed, {
      type: "heal_full_year_unit",
      yearIndex: 0,
      code: "FY",
      fullYearCodes: [],
    }),
    removed
  )

  const onLeave = planState([
    { S1: ["FY"], S2: { unitCodes: [], status: "leave" } },
  ])
  assert.equal(
    plannerReducer(onLeave, {
      type: "heal_full_year_unit",
      yearIndex: 0,
      code: "FY",
      fullYearCodes: [],
    }),
    onLeave
  )
})

test("swap_units swaps across slots and within one slot", () => {
  let s = planState([{ S1: ["A", "B"], S2: ["C"] }])
  s = apply(s, {
    type: "swap_units",
    a: { yearIndex: 0, slotIndex: 0, code: "A" },
    b: { yearIndex: 0, slotIndex: 1, code: "C" },
  })
  assert.deepEqual(grid(s)[0], [["C", "B"], ["A"]])
  s = apply(s, {
    type: "swap_units",
    a: { yearIndex: 0, slotIndex: 0, code: "C" },
    b: { yearIndex: 0, slotIndex: 0, code: "B" },
  })
  assert.deepEqual(grid(s)[0], [["B", "C"], ["A"]])
})

test("swap_units is a no-op for a missing code or a locked slot", () => {
  const s = planState([{ S1: ["A"], S2: { unitCodes: ["C"], locked: true } }])
  assert.equal(
    plannerReducer(s, {
      type: "swap_units",
      a: { yearIndex: 0, slotIndex: 0, code: "A" },
      b: { yearIndex: 0, slotIndex: 1, code: "Z" },
    }),
    s
  )
  assert.equal(
    plannerReducer(s, {
      type: "swap_units",
      a: { yearIndex: 0, slotIndex: 0, code: "A" },
      b: { yearIndex: 0, slotIndex: 1, code: "C" },
    }),
    s
  )
})

/* ------------------------------------------------------------------ *
 * Slots that take no units
 * ------------------------------------------------------------------ */

test("add_unit into a leave, exchange or locked semester is a no-op", () => {
  const s = planState([
    {
      S1: { unitCodes: [], status: "leave" },
      S2: { unitCodes: [], status: "exchange", creditPoints: 24 },
      SUMMER_A: { unitCodes: [], locked: true },
    },
  ])
  for (const slotIndex of [0, 1, 2])
    assert.equal(
      plannerReducer(s, {
        type: "add_unit",
        yearIndex: 0,
        slotIndex,
        code: "A",
      }),
      s
    )
})

test("add_unit into an ordinary semester still works", () => {
  const s = apply(planState([{ S1: [], S2: [] }]), {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 1,
    code: "A",
  })
  assert.deepEqual(grid(s)[0], [[], ["A"]])
})

test("add_full_year_unit refuses a year whose S2 is on exchange", () => {
  const s = planState([
    { S1: [], S2: { unitCodes: [], status: "exchange", creditPoints: 24 } },
  ])
  assert.equal(
    plannerReducer(s, {
      type: "add_full_year_unit",
      yearIndex: 0,
      code: "FY",
      fullYearCodes: [],
    }),
    s
  )
})

test("move_unit won't move into a leave slot or out of a locked one", () => {
  const s = planState([
    { S1: ["A"], S2: { unitCodes: [], status: "leave" } },
    { S1: { unitCodes: ["B"], locked: true }, S2: [] },
  ])
  const move = (
    from: [number, number],
    to: [number, number],
    code: string
  ): PlannerAction => ({
    type: "move_unit",
    fromYearIndex: from[0],
    fromSlotIndex: from[1],
    toYearIndex: to[0],
    toSlotIndex: to[1],
    code,
  })
  assert.equal(plannerReducer(s, move([0, 0], [0, 1], "A")), s)
  assert.equal(plannerReducer(s, move([1, 0], [1, 1], "B")), s)
  assert.deepEqual(grid(apply(s, move([0, 0], [1, 1], "A")))[1], [["B"], ["A"]])
})

/* ------------------------------------------------------------------ *
 * Bulk and whole-plan actions
 * ------------------------------------------------------------------ */

test("bulk_load merges, replaces and grows the plan for later years", () => {
  const s = planState([{ S1: ["A"], S2: [] }])
  const placements = [
    { code: "B", yearIndex: 0, slotIndex: 0 },
    { code: "A", yearIndex: 0, slotIndex: 0 },
    { code: "C", yearIndex: 2, slotIndex: 1 },
  ]
  const merged = apply(s, { type: "bulk_load", placements, mode: "merge" })
  assert.deepEqual(grid(merged), [
    [["A", "B"], []],
    [[], []],
    [[], ["C"]],
  ])
  const replaced = apply(s, { type: "bulk_load", placements, mode: "replace" })
  assert.deepEqual(grid(replaced)[0], [["B", "A"], []])
})

test("bulk_load skips slots that take no units", () => {
  const s = planState([{ S1: { unitCodes: [], status: "leave" }, S2: [] }])
  const after = apply(s, {
    type: "bulk_load",
    placements: [{ code: "A", yearIndex: 0, slotIndex: 0 }],
    mode: "merge",
  })
  assert.equal(after, s)
})

test("set_year changes the handbook year and clears units and AoS", () => {
  let s = planState([{ S1: ["A"], S2: ["B"] }])
  s = apply(s, { type: "set_aos", role: "major", code: "SFTWRDEV08" })
  const next = plannerReducer(s, { type: "set_year", year: "2027" })
  assert.equal(next.courseYear, "2027")
  assert.deepEqual(next.selectedAos, {})
  assert.deepEqual(grid(next), [[[], []]])
  assert.equal(plannerReducer(next, { type: "set_year", year: "2027" }), next)
})

test("set_slot_capacity clamps to the placed units and to the maximum", () => {
  const s = planState([{ S1: ["A", "B", "C"], S2: [] }])
  const cap = (capacity: number) =>
    plannerReducer(s, {
      type: "set_slot_capacity",
      yearIndex: 0,
      slotIndex: 0,
      capacity,
    }).years[0].slots[0].capacity
  assert.equal(cap(1), 3)
  assert.equal(cap(99), 8)
  assert.equal(cap(6), 6)
  // The default capacity, 4, is already in effect: no change.
  assert.equal(
    plannerReducer(s, {
      type: "set_slot_capacity",
      yearIndex: 0,
      slotIndex: 0,
      capacity: 4,
    }),
    s
  )
})

test("clear_slot and clear_year empty units; clearing an empty slot is a no-op", () => {
  const s = planState([
    { S1: ["A"], S2: ["B"] },
    { S1: ["C"], S2: [] },
  ])
  const slot = apply(s, { type: "clear_slot", yearIndex: 0, slotIndex: 0 })
  assert.deepEqual(grid(slot), [
    [[], ["B"]],
    [["C"], []],
  ])
  assert.equal(
    plannerReducer(slot, { type: "clear_slot", yearIndex: 0, slotIndex: 0 }),
    slot
  )
  const year = apply(s, { type: "clear_year", yearIndex: 0 })
  assert.deepEqual(grid(year), [
    [[], []],
    [["C"], []],
  ])
})

test("toggle_slot_lock flips the lock", () => {
  const s = planState([{ S1: [], S2: [] }])
  const lock = { type: "toggle_slot_lock", yearIndex: 0, slotIndex: 0 } as const
  const locked = apply(s, lock)
  assert.equal(locked.years[0].slots[0].locked, true)
  assert.equal(apply(locked, lock).years[0].slots[0].locked, false)
})

test("reset empties the plan, keeping course, intake and year count", () => {
  const s = planState(
    [
      { S2: ["A"], S1: ["B"] },
      { S2: [], S1: [] },
    ],
    { startPeriod: "S2", courseCode: "C2001" }
  )
  const next = apply(s, { type: "reset" })
  assert.equal(next.courseCode, "C2001")
  assert.deepEqual(
    next.years.map((y) => y.slots.map((sl) => sl.kind)),
    [
      ["S2", "S1"],
      ["S2", "S1"],
    ]
  )
  assert.deepEqual(grid(next), [
    [[], []],
    [[], []],
  ])
  assert.equal(apply(s, { type: "reset", yearCount: 4 }).years.length, 4)
})

test("batch applies several actions as one undo step", () => {
  let h = initialHistory(defaultState("2026", "C2000", 1))
  h = historyReducer(h, {
    type: "batch",
    actions: [
      { type: "add_optional_slot", yearIndex: 0, kind: "SUMMER_A" },
      { type: "add_year" },
    ],
  })
  assert.equal(h.present.years.length, 2)
  assert.equal(h.present.years[0].slots.length, 3)
  assert.equal(h.past.length, 1)
  h = historyReducer(h, { type: "undo" })
  assert.equal(h.present.years.length, 1)
  assert.equal(h.present.years[0].slots.length, 2)
})
