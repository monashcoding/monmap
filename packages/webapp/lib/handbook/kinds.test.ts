import assert from "node:assert/strict"
import { test } from "node:test"

import { AOS_KINDS, aosKindLabel, aosKindWord, kindFromCode } from "./kinds.ts"

test("every AoS kind has one entry, and unknown kinds fall back", () => {
  assert.equal(new Set(AOS_KINDS.map((k) => k.id)).size, AOS_KINDS.length)
  assert.equal(aosKindLabel("extended_major"), "Extended major")
  assert.equal(aosKindLabel(null), "Area of study")
  assert.equal(aosKindLabel("nonsense"), "Area of study")
  assert.equal(aosKindWord("elective"), "elective stream")
  assert.equal(aosKindWord(undefined), "area of study")
})

test("2027 codes name their kind", () => {
  assert.equal(kindFromCode("DASC-MAJ"), "major")
  assert.equal(kindFromCode("DASC-EXMAJ"), "extended_major")
  assert.equal(kindFromCode("DASC-MIN"), "minor")
  assert.equal(kindFromCode("ALSO-USPEC"), "specialisation")
  assert.equal(kindFromCode("SFTWRDEV08"), null)
})
