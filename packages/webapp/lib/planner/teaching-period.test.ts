import { test } from "node:test"
import assert from "node:assert/strict"

import { classifyTeachingPeriod } from "./teaching-period.ts"

test("First semester variants all classify to S1", () => {
  for (const p of [
    "First semester",
    "First semester - alternate",
    "First semester (extended)",
    "First semester (Northern)",
    "First semester (Northern) - alternate",
  ]) {
    assert.equal(classifyTeachingPeriod(p), "S1", p)
  }
})

test("Second semester variants all classify to S2", () => {
  for (const p of [
    "Second semester",
    "Second semester - alternate",
    "Second semester (extended)",
    "Second semester (Northern)",
  ]) {
    assert.equal(classifyTeachingPeriod(p), "S2", p)
  }
})

test("Summer/Winter distinct classes", () => {
  assert.equal(classifyTeachingPeriod("Summer semester A"), "SUMMER_A")
  assert.equal(
    classifyTeachingPeriod("Summer semester A - alternate"),
    "SUMMER_A"
  )
  assert.equal(classifyTeachingPeriod("Summer semester B"), "SUMMER_B")
  assert.equal(classifyTeachingPeriod("Winter semester"), "WINTER")
  assert.equal(classifyTeachingPeriod("Winter semester - alternate"), "WINTER")
})

test("Full year", () => {
  assert.equal(classifyTeachingPeriod("Full year"), "FULL_YEAR")
  assert.equal(classifyTeachingPeriod("Full year extended"), "FULL_YEAR")
})

test("Unrecognised periods collapse to OTHER", () => {
  for (const p of [
    "Research quarter 1",
    "Teaching period 3",
    "Monash Indonesia term 2",
    "Term 1",
    "Trimester 1",
    "November teaching period",
    "",
    null,
    undefined,
  ]) {
    const got = classifyTeachingPeriod(p)
    assert.equal(got, "OTHER", `${p} classified as ${got}`)
  }
})

test("A period spanning S2 into S1 classifies by its start, as S2", () => {
  // Not a clean S1 or S2, but the prefix match takes "Second semester".
  assert.equal(
    classifyTeachingPeriod("Second semester to First semester"),
    "S2"
  )
})
