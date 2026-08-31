import { test } from "node:test"
import assert from "node:assert/strict"

import { MAX_SHARED_UNITS_BETWEEN_AOS, detectAosOverlaps } from "./overlap.ts"
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
