import { test } from "node:test"
import assert from "node:assert/strict"

import { coreq, planState, prereq } from "./test-fixtures.ts"
import {
  placedWaivers,
  waivableCodes,
  waiverAccess,
  waiverNote,
  waiversByUnit,
  withWaived,
} from "./waivers.ts"

test("waiversByUnit groups each unit's waived prerequisites", () => {
  const byUnit = waiversByUnit({
    waivers: [
      { unitCode: "AAA2000", prerequisiteCode: "AAA1000" },
      { unitCode: "AAA2000", prerequisiteCode: "AAA1001" },
      { unitCode: "AAA3000", prerequisiteCode: "AAA2000" },
    ],
  })

  assert.deepEqual([...byUnit.get("AAA2000")!], ["AAA1000", "AAA1001"])
  assert.deepEqual([...byUnit.get("AAA3000")!], ["AAA2000"])
})

test("waiversByUnit reads a plan saved before waivers existed", () => {
  assert.equal(waiversByUnit({}).size, 0)
})

test("withWaived adds to the completed codes without changing them", () => {
  const completed = new Set(["AAA1000"])

  assert.deepEqual(
    [...withWaived(completed, new Set(["AAA1001"]))],
    ["AAA1000", "AAA1001"]
  )
  assert.deepEqual([...completed], ["AAA1000"])
  assert.equal(withWaived(completed, undefined), completed)
})

test("waiverAccess edits only where validation reads the tree on screen", () => {
  const view = {
    isPlaced: true,
    usingCurrentYear: true,
    selectedYear: "2026",
    defaultYear: "2026",
  }

  assert.equal(waiverAccess(view), "edit")
  // Opened from search or an unplaced chip: no slot to validate.
  assert.equal(waiverAccess({ ...view, isPlaced: false }), "read")
  // A full-year unit's other half, loaded from another handbook year.
  assert.equal(
    waiverAccess({
      ...view,
      usingCurrentYear: false,
      selectedYear: "2027",
      defaultYear: "2027",
    }),
    "read"
  )
  // Browsing another year with the picker.
  assert.equal(
    waiverAccess({ ...view, usingCurrentYear: false, selectedYear: "2025" }),
    "none"
  )
})

test("waivableCodes offers only unmet prerequisite codes", () => {
  assert.deepEqual([...waivableCodes(undefined)], [])
  assert.deepEqual(
    [
      ...waivableCodes({
        errors: [
          {
            kind: "prereq_unmet",
            message: "",
            // A leaf with no code stays empty, and can't be waived.
            relatedCodes: ["AAA1000", ""],
          },
          { kind: "coreq_unmet", message: "", relatedCodes: ["AAA1001"] },
        ],
      }),
    ],
    ["AAA1000"]
  )
})

test("placedWaivers leaves out a unit no longer on the plan", () => {
  const placed = { unitCode: "AAA3000", prerequisiteCode: "AAA1000" }
  const removed = { unitCode: "AAA3001", prerequisiteCode: "AAA1000" }

  assert.deepEqual(
    placedWaivers(
      planState([{ S1: ["AAA3000"] }], { waivers: [placed, removed] })
    ),
    [placed]
  )
})

test("waiverNote says when a waiver isn't doing anything", () => {
  const waiver = { unitCode: "AAA3000", prerequisiteCode: "AAA1000" }
  const planned = new Set(["AAA3000"])

  const note = (blocks?: ReturnType<typeof prereq>[]) =>
    waiverNote(waiver, planned, new Map(blocks ? [["AAA3000", blocks]] : []))

  assert.equal(note([prereq("AAA1000")]), null)
  // Not loaded yet: nothing to say.
  assert.equal(note(), null)
  assert.match(note([prereq("AAA1001")]) ?? "", /No longer/)
  assert.match(note([coreq("AAA1000")]) ?? "", /No longer/)
  assert.match(
    waiverNote(waiver, new Set(), new Map()) ?? "",
    /isn't on your plan/
  )
})
