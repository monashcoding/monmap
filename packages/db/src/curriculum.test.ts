import { test } from "node:test"
import assert from "node:assert/strict"

import {
  extractRequirementGroups,
  extractEmbeddedSpecialisations,
  extractSubCourseRefs,
  extractComponentLabels,
  pickDefaultUnits,
} from "./curriculum.ts"

/* ------------------------------------------------------------------ *
 * Fixtures
 *
 * Shapes are minimised reproductions of real curriculum_structure
 * payloads observed in Postgres. Source years/courses are noted on
 * each fixture so future drift can be re-checked against the corpus.
 * ------------------------------------------------------------------ */

const subjectLeaf = (
  code: string,
  cp: number,
  order = 0,
  connector: "AND" | "OR" = "AND",
) => ({
  academic_item_code: code,
  academic_item_credit_points: String(cp),
  academic_item_type: { value: "subject", label: "Unit" },
  parent_connector: { value: connector, label: connector },
  order: String(order),
})

const courseLeaf = (code: string) => ({
  academic_item_code: code,
  academic_item_type: { value: "course", label: "Course" },
})

/* ------------------------------------------------------------------ *
 * extractEmbeddedSpecialisations — A4
 * ------------------------------------------------------------------ */

test("embedded specs: 2-sub mandatory pair is NOT classified as choice (E3001 2023 Part A regression)", () => {
  // Real shape: Part A (12cp) with two 12cp children whose internal
  // groups are all-required. Pre-fix this fired as a choice container
  // and surfaced "Engineering fundamentals" + "Foundational skills"
  // as picker options.
  const structure = {
    container: [
      {
        title: "Part A. Engineering fundamentals and foundational skills",
        credit_points: "12",
        container: [
          {
            title: "Engineering fundamentals",
            credit_points: "12",
            relationship: [subjectLeaf("ENG1014", 6, 0), subjectLeaf("ENG1005", 6, 100)],
          },
          {
            title: "Foundational skills",
            credit_points: "12",
            relationship: [subjectLeaf("PHS1001", 6, 0), subjectLeaf("ENG1090", 6, 100)],
          },
        ],
      },
    ],
  }
  const specs = extractEmbeddedSpecialisations(structure)
  assert.deepEqual(specs, [], "2-sub case must not fire")
})

test("embedded specs: 5-track choice IS classified (C2001-style)", () => {
  // Synthetic but mirrors C2001 Part D's 5 tracks at 12cp under a
  // 12cp parent — totalContrib (60) > parentCp (12), each ≥ parentCp/2.
  const structure = {
    container: [
      {
        title: "Part D. Specialisation",
        credit_points: "12",
        container: [
          { title: "Track 1", credit_points: "12", relationship: [subjectLeaf("FIT3140", 6)] },
          { title: "Track 2", credit_points: "12", relationship: [subjectLeaf("FIT3171", 6)] },
          { title: "Track 3", credit_points: "12", relationship: [subjectLeaf("FIT3174", 6)] },
          { title: "Track 4", credit_points: "12", relationship: [subjectLeaf("FIT3175", 6)] },
          { title: "Track 5", credit_points: "12", relationship: [subjectLeaf("FIT3176", 6)] },
        ],
      },
    ],
  }
  const specs = extractEmbeddedSpecialisations(structure)
  assert.equal(specs.length, 5)
  assert.deepEqual(specs.map((s) => s.title).sort(), [
    "Track 1",
    "Track 2",
    "Track 3",
    "Track 4",
    "Track 5",
  ])
})

test("embedded specs: choice container replaces parent extraction (no double-counting)", () => {
  // Once Part D is classified as choice, the standard group extractor
  // must not also emit its leaves as mandatory.
  const structure = {
    container: [
      {
        title: "Part D",
        credit_points: "12",
        container: [
          { title: "T1", credit_points: "12", relationship: [subjectLeaf("U1", 12)] },
          { title: "T2", credit_points: "12", relationship: [subjectLeaf("U2", 12)] },
          { title: "T3", credit_points: "12", relationship: [subjectLeaf("U3", 12)] },
        ],
      },
    ],
  }
  const specs = extractEmbeddedSpecialisations(structure)
  assert.equal(specs.length, 3, "all three tracks emitted")
})

test("embedded specs: parent with cp = 0 is skipped", () => {
  const structure = {
    container: [
      {
        title: "Reference list",
        credit_points: "0",
        container: [
          { title: "T1", credit_points: "12", relationship: [subjectLeaf("U1", 12)] },
          { title: "T2", credit_points: "12", relationship: [subjectLeaf("U2", 12)] },
          { title: "T3", credit_points: "12", relationship: [subjectLeaf("U3", 12)] },
        ],
      },
    ],
  }
  assert.deepEqual(extractEmbeddedSpecialisations(structure), [])
})

/* ------------------------------------------------------------------ *
 * extractRequirementGroups — A1, A2, A9
 * ------------------------------------------------------------------ */

test("requirement groups: mandatory leaf list (all required, container_cp >= leaf_total)", () => {
  const structure = {
    container: [
      {
        title: "Core",
        credit_points: "18",
        relationship: [subjectLeaf("U1", 6, 0), subjectLeaf("U2", 6, 1), subjectLeaf("U3", 6, 2)],
      },
    ],
  }
  const groups = extractRequirementGroups(structure)
  assert.equal(groups.length, 1)
  assert.equal(groups[0]!.grouping, "Core")
  assert.deepEqual(groups[0]!.options, ["U1", "U2", "U3"])
  assert.equal(groups[0]!.required, 3)
})

test("requirement groups: leaf choice (containerCp < leafTotalCp picks how many fit)", () => {
  // Container budget 6, two 6cp leaves => required = 1
  const structure = {
    container: [
      {
        title: "Pick one",
        credit_points: "6",
        relationship: [subjectLeaf("U1", 6, 0), subjectLeaf("U2", 6, 1)],
      },
    ],
  }
  const groups = extractRequirementGroups(structure)
  assert.equal(groups[0]!.required, 1)
  assert.equal(groups[0]!.options.length, 2)
})

test("requirement groups: zero-cp group falls back to parent_connector OR ⇒ 1", () => {
  const structure = {
    container: [
      {
        title: "ENG0001/ENG0002 professional practice",
        credit_points: "0",
        relationship: [
          subjectLeaf("ENG0001", 0, 0, "OR"),
          subjectLeaf("ENG0002", 0, 1, "OR"),
        ],
      },
    ],
  }
  const groups = extractRequirementGroups(structure)
  assert.equal(groups[0]!.required, 1)
})

test("requirement groups: same title at multiple paths is de-duplicated", () => {
  const structure = {
    container: [
      {
        title: "Wrapper",
        credit_points: "12",
        container: [
          {
            title: "Core",
            credit_points: "6",
            relationship: [subjectLeaf("U1", 6, 0)],
          },
          {
            title: "Core",
            credit_points: "6",
            relationship: [subjectLeaf("U2", 6, 0)],
          },
        ],
      },
    ],
  }
  const groups = extractRequirementGroups(structure)
  assert.equal(groups.length, 1, "two 'Core' containers collapse to one group")
  assert.deepEqual(new Set(groups[0]!.options), new Set(["U1", "U2"]))
})

test("requirement groups: optional sub-container (sum-without-it still meets budget) is skipped", () => {
  // Parent 12cp with three 12cp subs — any one can satisfy alone, so
  // each is optional and the walker doesn't recurse into them at all.
  // (This is the choice-container case handled by extractEmbeddedSpecs.)
  const structure = {
    container: [
      {
        title: "Pick one part",
        credit_points: "12",
        container: [
          { title: "A", credit_points: "12", relationship: [subjectLeaf("U1", 12)] },
          { title: "B", credit_points: "12", relationship: [subjectLeaf("U2", 12)] },
          { title: "C", credit_points: "12", relationship: [subjectLeaf("U3", 12)] },
        ],
      },
    ],
  }
  const groups = extractRequirementGroups(structure)
  assert.deepEqual(groups, [], "no group emitted for a pure choice container")
})

test("pickDefaultUnits: drops choice groups, keeps fully-mandatory ones", () => {
  const groups = [
    { grouping: "Core", options: ["U1", "U2"], required: 2 },
    { grouping: "Pick one", options: ["U3", "U4"], required: 1 },
  ]
  const defaults = pickDefaultUnits(groups)
  assert.deepEqual(defaults.map((d) => d.code), ["U1", "U2"])
})

/* ------------------------------------------------------------------ *
 * extractSubCourseRefs — A7
 * ------------------------------------------------------------------ */

test("sub-course refs: top-level relationship is found (double-degree case)", () => {
  const structure = {
    container: [
      {
        title: "Computer Science component",
        relationship: [courseLeaf("C2001")],
      },
      {
        title: "Engineering component",
        relationship: [courseLeaf("E3001")],
      },
    ],
  }
  const refs = extractSubCourseRefs(structure)
  assert.deepEqual(refs.map((r) => r.courseCode).sort(), ["C2001", "E3001"])
  assert.deepEqual(refs.find((r) => r.courseCode === "C2001")!.componentTitle, "Computer Science component")
})

test("sub-course refs: deeply-nested course pointer is found (A7 regression: M6041, A6039)", () => {
  // Pre-fix the depth-1-only walker silently dropped these.
  const structure = {
    container: [
      {
        title: "Part A. Core",
        container: [
          {
            title: "Specialisation prerequisites",
            relationship: [courseLeaf("C6001")],
          },
        ],
      },
    ],
  }
  const refs = extractSubCourseRefs(structure)
  assert.deepEqual(refs, [
    { componentTitle: "Specialisation prerequisites", courseCode: "C6001" },
  ])
})

test("sub-course refs: subject-typed leaves are ignored", () => {
  const structure = {
    container: [
      { title: "Core", relationship: [subjectLeaf("U1", 6), courseLeaf("X1")] },
    ],
  }
  const refs = extractSubCourseRefs(structure)
  assert.deepEqual(refs.map((r) => r.courseCode), ["X1"])
})

test("sub-course refs: duplicates de-duped by (componentTitle, code)", () => {
  const structure = {
    container: [
      { title: "Part A", relationship: [courseLeaf("X1"), courseLeaf("X1")] },
    ],
  }
  const refs = extractSubCourseRefs(structure)
  assert.equal(refs.length, 1)
})

/* ------------------------------------------------------------------ *
 * extractComponentLabels — A8
 * ------------------------------------------------------------------ */

test("component labels: every leaf code is labelled with depth-1 ancestor title", () => {
  const structure = {
    container: [
      {
        title: "Computer Science component",
        container: [{ relationship: [subjectLeaf("FIT1045", 6)] }],
      },
      {
        title: "Engineering component",
        container: [{ relationship: [subjectLeaf("ENG1001", 6)] }],
      },
    ],
  }
  const labels = extractComponentLabels(structure)
  assert.equal(labels["FIT1045"], "Computer Science component")
  assert.equal(labels["ENG1001"], "Engineering component")
})

test("component labels: first-wins for codes appearing in multiple components", () => {
  const structure = {
    container: [
      { title: "First", container: [{ relationship: [subjectLeaf("X1", 6)] }] },
      { title: "Second", container: [{ relationship: [subjectLeaf("X1", 6)] }] },
    ],
  }
  const labels = extractComponentLabels(structure)
  assert.equal(labels["X1"], "First")
})
