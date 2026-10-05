import { test } from "node:test"
import assert from "node:assert/strict"

import { unitLevel } from "./unit-level.ts"

test("unitLevel reads the whole number, not its first digit", () => {
  assert.equal(unitLevel("Level 1"), 1)
  assert.equal(unitLevel("Level 3"), 3)
  assert.equal(unitLevel("Postgraduate Level 10"), 10)
})

test("unitLevel is null without a number", () => {
  assert.equal(unitLevel(null), null)
  assert.equal(unitLevel(undefined), null)
  assert.equal(unitLevel(""), null)
  assert.equal(unitLevel("Postgraduate"), null)
})
