import { test } from "node:test"
import assert from "node:assert/strict"

import {
  MAX_SHARED_UNITS_BETWEEN_AOS,
  detectAosOverlaps,
  summarizeAosCreditBudget,
} from "./overlap.ts"
import type { PickedAosEntry } from "./aos-slots.ts"
import type { PlannerAreaOfStudy } from "./types.ts"

function aos(
  code: string,
  units: string[],
  kind: PlannerAreaOfStudy["kind"] = "major"
): PlannerAreaOfStudy {
  return {
    code,
    title: code,
    kind,
    relationshipLabel: "",
    creditPoints: null,
    units: units.map((c) => ({ code: c, grouping: "Core" })),
    requiredUnits: [],
    requirements: [],
  }
}

const pick = (a: PlannerAreaOfStudy): PickedAosEntry => ({
  slotKey: a.kind,
  label: a.kind,
  aos: a,
})

test("disjoint areas of study report nothing", () => {
  const picked = [pick(aos("ECON", ["E1", "E2"])), pick(aos("FIN", ["F1"]))]
  assert.deepEqual(detectAosOverlaps(picked, new Set(["E1", "E2", "F1"])), [])
})

test("a shared unit only counts once the student has placed it", () => {
  // Listing the same unit as an option in two majors is not double
  // counting until one of them is actually taken.
  const picked = [pick(aos("ECON", ["SHARED"])), pick(aos("FIN", ["SHARED"]))]
  assert.deepEqual(detectAosOverlaps(picked, new Set()), [])
  assert.equal(detectAosOverlaps(picked, new Set(["SHARED"])).length, 1)
})

test("sharing within the cap is a note, not a warning", () => {
  const picked = [
    pick(aos("ECON", ["S1", "S2", "E1"])),
    pick(aos("FIN", ["S1", "S2", "F1"])),
  ]
  const [o] = detectAosOverlaps(picked, new Set(["S1", "S2", "E1", "F1"]))
  assert.ok(o)
  assert.deepEqual(o.sharedCodes, ["S1", "S2"])
  assert.equal(o.severity, "note")
  assert.equal(MAX_SHARED_UNITS_BETWEEN_AOS, 2)
})

test("exceeding the cap escalates to a warning naming the limit", () => {
  const picked = [
    pick(aos("ECON", ["S1", "S2", "S3"])),
    pick(aos("FIN", ["S1", "S2", "S3"])),
  ]
  const [o] = detectAosOverlaps(picked, new Set(["S1", "S2", "S3"]))
  assert.ok(o)
  assert.equal(o.severity, "warning")
  assert.deepEqual(o.sharedCodes, ["S1", "S2", "S3"])
  assert.match(o.message, /at most 2 units/)
})

test("two minors sharing is only a breach when the course states that rule", () => {
  const picked = [
    pick(aos("MN1", ["S1"], "minor")),
    pick(aos("MN2", ["S1"], "minor")),
  ]
  const planned = new Set(["S1"])
  // Default off: the rule appears only from 2023 and in 4-6 courses,
  // so it must not fire on a 2020-2022 plan.
  assert.equal(detectAosOverlaps(picked, planned)[0]!.severity, "note")
  assert.equal(
    detectAosOverlaps(picked, planned, { minorsMayNotShareUnits: true })[0]!
      .severity,
    "warning"
  )
})

test("the minor rule does not apply to a major/minor pair", () => {
  const picked = [
    pick(aos("MAJ", ["S1"], "major")),
    pick(aos("MN", ["S1"], "minor")),
  ]
  const [o] = detectAosOverlaps(picked, new Set(["S1"]), {
    minorsMayNotShareUnits: true,
  })
  assert.equal(o!.severity, "note")
})

test("requirement-group options count as membership, not just units[]", () => {
  const a = aos("A", [])
  a.requirements = [{ grouping: "Core", required: 1, options: ["G1"] }]
  const b = aos("B", ["G1"])
  const [o] = detectAosOverlaps([pick(a), pick(b)], new Set(["G1"]))
  assert.ok(o)
  assert.deepEqual(o.sharedCodes, ["G1"])
})

test("three picks produce all three pairs", () => {
  const picked = [
    pick(aos("A", ["S"])),
    pick(aos("B", ["S"])),
    pick(aos("C", ["S"])),
  ]
  const out = detectAosOverlaps(picked, new Set(["S"]))
  assert.equal(out.length, 3)
  assert.deepEqual(
    out.map((o) => `${o.a.code}/${o.b.code}`),
    ["A/B", "A/C", "B/C"]
  )
})

test("the same AoS reached through two slots is not an overlap with itself", () => {
  const same = aos("ECON", ["S1"])
  const out = detectAosOverlaps(
    [
      { slotKey: "major", label: "Major", aos: same },
      { slotKey: "minor", label: "Minor", aos: same },
    ],
    new Set(["S1"])
  )
  assert.deepEqual(out, [])
})

test("shared codes are sorted and deduplicated", () => {
  const picked = [
    pick(aos("A", ["Z", "A", "M", "A"])),
    pick(aos("B", ["M", "Z", "A"])),
  ]
  const [o] = detectAosOverlaps(picked, new Set(["A", "M", "Z"]))
  assert.deepEqual(o!.sharedCodes, ["A", "M", "Z"])
})

/* ------------------------------------------------------------------ *
 * Same discipline as both a major and an extended major.
 *
 * Reported from the browser on A2000 2026: the picker happily held
 * PSYCHOL07 "Psychology" (major) and PSYCHOL09 "Psychology" (extended
 * major) at once. They list the identical 10 units — an extended major
 * extends the major of the same name rather than sitting beside it —
 * so holding both is redundant, not a double count.
 * ------------------------------------------------------------------ */

test("a major and an extended major of the same discipline warn on sight", () => {
  const major = aos("PSYCHOL07", ["PSY1011", "PSY1023"], "major")
  major.title = "Psychology"
  const ext = aos("PSYCHOL09", ["PSY1011", "PSY1023"], "extended_major")
  ext.title = "Psychology"

  // No units placed at all: the redundancy is structural, so waiting
  // for a placement would let the student build on a contradiction.
  const [o] = detectAosOverlaps([pick(major), pick(ext)], new Set())
  assert.ok(o, "must fire with nothing placed")
  assert.equal(o.severity, "warning")
  assert.match(o.message, /already includes/)
  assert.match(o.message, /pick one/)
})

test("the message names the extended major as the one that subsumes", () => {
  const major = aos("EUROPLAN01", ["X"], "major")
  major.title = "European languages"
  const ext = aos("EUROPLAN03", ["X"], "extended_major")
  ext.title = "European languages"
  // Order of picks must not change which is described as subsuming.
  for (const picks of [
    [major, ext],
    [ext, major],
  ]) {
    const [o] = detectAosOverlaps(picks.map(pick), new Set())
    assert.match(
      o!.message,
      /European languages extended major already includes/
    )
  }
})

test("two different disciplines are not redundant", () => {
  const a = aos("ANTHROPL11", ["U1"], "major")
  a.title = "Anthropology"
  const b = aos("PSYCHOL09", ["U1"], "extended_major")
  b.title = "Psychology"
  const [o] = detectAosOverlaps([pick(a), pick(b)], new Set())
  // They share a placed unit or nothing — never the redundancy message.
  assert.ok(!o || !/already includes/.test(o.message))
})

test("two majors of the same title are not the extended-major case", () => {
  const a = aos("X1", ["U1"], "major")
  a.title = "History"
  const b = aos("X2", ["U1"], "major")
  b.title = "History"
  const [o] = detectAosOverlaps([pick(a), pick(b)], new Set(["U1"]))
  assert.ok(o)
  assert.ok(
    !/already includes/.test(o.message),
    "that rule is major vs extended only"
  )
})

test("titles differing only by case or spacing still match", () => {
  const major = aos("M", ["U"], "major")
  major.title = "  european   languages "
  const ext = aos("E", ["U"], "extended_major")
  ext.title = "European languages"
  const [o] = detectAosOverlaps([pick(major), pick(ext)], new Set())
  assert.ok(o)
  assert.match(o.message, /already includes/)
})

/* ------------------------------------------------------------------ *
 * Credit budget — "where you have space in your degree" is the only
 * limit the handbook states, so it needs to be visible.
 * ------------------------------------------------------------------ */

function withCp(
  code: string,
  cp: number,
  kind: PlannerAreaOfStudy["kind"] = "major"
) {
  const a = aos(code, [], kind)
  a.creditPoints = cp
  return pick(a)
}

test("no budget line without a course credit-point total", () => {
  assert.equal(summarizeAosCreditBudget([withCp("A", 48)], null), null)
  assert.equal(summarizeAosCreditBudget([withCp("A", 48)], 0), null)
})

test("no budget line when nothing is picked", () => {
  assert.equal(summarizeAosCreditBudget([], 144), null)
})

test("one major of a 144 point degree is well within budget", () => {
  const b = summarizeAosCreditBudget([withCp("A", 48)], 144)!
  assert.equal(b.pickedCreditPoints, 48)
  assert.equal(b.overCommitted, false)
  assert.match(b.message, /48 of the degree's 144/)
})

test("two majors still fit", () => {
  const b = summarizeAosCreditBudget([withCp("A", 48), withCp("B", 48)], 144)!
  assert.equal(b.pickedCreditPoints, 96)
  assert.equal(b.overCommitted, false)
})

test("three majors consume the whole degree and are flagged", () => {
  // 3 x 48 = 144 of 144: nothing left for the rest of the course. This
  // is the case the screenshot showed, and why the pick cap is 2.
  const b = summarizeAosCreditBudget(
    [withCp("A", 48), withCp("B", 48), withCp("C", 48)],
    144
  )!
  assert.equal(b.pickedCreditPoints, 144)
  assert.equal(b.overCommitted, true)
  assert.match(b.message, /leaving no room/)
})

test("the same area reached through two slots is counted once", () => {
  const one = withCp("A", 48)
  const b = summarizeAosCreditBudget([one, { ...one, slotKey: "minor" }], 144)!
  assert.equal(b.pickedCreditPoints, 48)
})

test("areas with no credit points contribute nothing rather than NaN", () => {
  const noCp = pick(aos("X", []))
  const b = summarizeAosCreditBudget([withCp("A", 48), noCp], 144)!
  assert.equal(b.pickedCreditPoints, 48)
})
