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

test("requirement groups: choice container flattens to a single never-auto-load group", () => {
  // Parent 12cp with three 12cp subs — any one can satisfy alone. The
  // old walker skipped these entirely (invisible in the requirements
  // browser); now they flatten into one recall-first choice group.
  // extractEmbeddedSpecialisations still provides the structured picker.
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
  assert.equal(groups.length, 1)
  assert.equal(groups[0]!.grouping, "Pick one part")
  assert.deepEqual(groups[0]!.options, ["U1", "U2", "U3"])
  assert.equal(groups[0]!.required, 1, "12cp budget / 12cp leaves = pick 1")
  assert.equal(groups[0]!.autoLoad, false, "choice groups never auto-load")
  assert.deepEqual(
    pickDefaultUnits(groups),
    [],
    "no unit force-loaded from a choice container"
  )
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

/* ------------------------------------------------------------------ *
 * Golden fixtures — real curriculum_structure JSONB exported from the
 * corpus (see src/fixtures/*.json; each file records sourceUrl +
 * exportedAt). Expected sets were verified against the handbook's own
 * container `description` prose ("You must complete the following
 * units", "36 credit points (six units) from the following list", …).
 * ------------------------------------------------------------------ */

import { readFileSync } from "node:fs"

import { detectScope, type RequirementGroup } from "./curriculum.ts"
import { applyCurriculumOverrides, validateCurriculumOverrides } from "./overrides.ts"

function loadFixture(name: string): {
  code: string
  year: string
  creditPoints: number
  curriculumStructure: unknown
} {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"),
  )
}

/** Extract with the same root budget production callers pass. */
function extractFixture(name: string): RequirementGroup[] {
  const fx = loadFixture(name)
  return extractRequirementGroups(fx.curriculumStructure, fx.creditPoints ?? 0)
}

const autoSet = (groups: readonly RequirementGroup[]): Set<string> =>
  new Set(pickDefaultUnits(groups).map((u) => u.code))

const byGrouping = (
  groups: readonly RequirementGroup[],
  like: string,
): RequirementGroup | undefined =>
  groups.find((g) => g.grouping.toLowerCase().includes(like.toLowerCase()))

test("golden A2000 2026: Arts unit pools are visible (recall) and nothing force-loads", () => {
  // A2000 is the component course of 17 double degrees; the old parser
  // emitted [] here (null-cp Professional Futures pools were skipped),
  // which silently dropped the Arts half of every one of them.
  const groups = extractFixture("A2000-2026")
  for (const pool of [
    "Professional experience",
    "Intercultural expertise",
    "Innovation capability",
    "Global immersion",
  ]) {
    const g = byGrouping(groups, pool)
    assert.ok(g, `pool "${pool}" must be emitted`)
    assert.ok(g.options.length > 0)
    assert.equal(g.autoLoad, false, `pool "${pool}" must not auto-load`)
  }
  // BA has no universal core units — handbook: "complete 24 credit
  // points from the units in the following Professional Futures domains".
  assert.deepEqual([...autoSet(groups)], [])
})

test("golden S2000 2026: over-budget Part A emits groups; only the override flips SCI1000", () => {
  const groups = extractFixture("S2000-2026")
  const comm = byGrouping(groups, "core communication")
  assert.ok(comm, "Core communication group must exist")
  assert.deepEqual(comm.options, ["SCI1000"])
  assert.equal(comm.autoLoad, false, "cp math can't prove SCI1000 mandatory")

  const maths = byGrouping(groups, "mathematics and statistics")
  assert.ok(maths)
  assert.equal(maths.required, 1)
  assert.deepEqual(
    new Set(maths.options),
    new Set(["STA1010", "SCI1020", "MTH1030", "MTH1035", "SCI1022", "MTH1020"]),
  )

  const seq = byGrouping(groups, "level 1 science sequences")
  assert.ok(seq, "choice container must flatten into a visible group")
  assert.equal(seq.autoLoad, false)
  assert.ok(seq.required < seq.options.length)

  // Pre-override nothing loads; the checked-in override supplies the
  // "SCI1000 is universal" knowledge that superseded migration 0008.
  assert.deepEqual([...autoSet(groups)], [])
  const overrides = JSON.parse(
    readFileSync(
      new URL(
        "../../ingest/curriculum-overrides.json",
        import.meta.url,
      ),
      "utf8",
    ),
  )
  validateCurriculumOverrides(overrides)
  const { groups: patched, applied } = applyCurriculumOverrides(
    "S2000",
    "2026",
    groups,
    overrides,
  )
  assert.ok(applied.length >= 1)
  assert.deepEqual([...autoSet(patched)], ["SCI1000"])
})

test("golden S2000 2022 (drift): SCI1000 sits in a Clayton-scoped group and stays suppressed", () => {
  const groups = extractFixture("S2000-2022")
  const clayton = groups.find((g) => g.scope === "Clayton")
  assert.ok(clayton, "2022 splits by campus")
  assert.ok(clayton.options.includes("SCI1000"))
  assert.equal(clayton.autoLoad, false)
  assert.deepEqual([...autoSet(groups)], [])
})

test("golden B2001 2026: Part A budget minus sibling elective sub gives 6-of-7, no force-load", () => {
  // Handbook: "You must complete 42 credit points, comprising 36
  // credit points (six units) from the following list; and 6 credit
  // points (one unit) from specified [electives]". The old parser
  // force-loaded all 7 — including BOTH mutually-prohibited
  // accounting units (ACC1100 ⟂ ACC1001).
  const groups = extractFixture("B2001-2026")
  const core = byGrouping(groups, "part a. core studies")
  assert.ok(core)
  assert.equal(core.options.length, 7)
  assert.equal(core.required, 6)
  assert.equal(core.autoLoad, false)
  assert.deepEqual([...autoSet(groups)], [])
})

test("golden F2010 2026: scope suppression reproduces the migration-0008 hand patch", () => {
  const groups = extractFixture("F2010-2026")
  const indo = byGrouping(groups, "indonesian studies")
  assert.ok(indo)
  assert.equal(indo.scope, "Indonesia")
  assert.equal(indo.autoLoad, false, "BEI1270 must not load for everyone")
  assert.deepEqual(
    autoSet(groups),
    new Set([
      "BLK1000",
      "TDN1002",
      "TDN2001",
      "TDN3001",
      "TDN3002",
      "DWG1201",
      "OHS1000",
    ]),
  )
  const studios = byGrouping(groups, "studio practices")
  assert.ok(studios, "Part C studios flatten into a visible choice group")
  assert.equal(studios.autoLoad, false)
})

test("golden C2004 2026 (single-campus course): Malaysia core survives, electives and BEI1270 don't load", () => {
  const groups = extractFixture("C2004-2026")
  const auto = autoSet(groups)
  // Handbook: "You must complete the software development major" +
  // fixed core; electives are "chosen from across the Monash
  // Indonesia campus" (a pool, despite summing to the 48cp budget).
  for (const code of ["FIT1045", "FIT2094", "FIT3047", "FIT1050", "FIT3184"])
    assert.ok(auto.has(code), `${code} is core/major, must load`)
  assert.ok(!auto.has("BEI1270"), "Indonesia-scoped unit must not load")
  const electives = byGrouping(groups, "part c. elective")
  assert.ok(electives)
  assert.equal(electives.autoLoad, false, "elective pools never auto-load")
})

test("golden M3708 2026: campus-variant groups suppress each other", () => {
  const groups = extractFixture("M3708-2026")
  assert.deepEqual(
    autoSet(groups),
    new Set(["PSY4100", "PSY4210", "PSY4220", "PSY4270"]),
    "only campus-neutral Parts A+B load",
  )
  const clayton = groups.find((g) => g.options.includes("PSY4215"))
  const malaysia = groups.find((g) => g.options.includes("PSY4110"))
  assert.equal(clayton?.scope, "Clayton")
  assert.equal(clayton?.autoLoad, false)
  assert.equal(malaysia?.scope, "Malaysia")
  assert.equal(malaysia?.autoLoad, false)
})

test("golden M6030 2026: three parallel campus cores load nothing (was: triple-core force-load)", () => {
  const groups = extractFixture("M6030-2026")
  const scopes = new Set(groups.map((g) => g.scope).filter(Boolean))
  assert.ok(scopes.size >= 3, `expected ≥3 campus scopes, got ${[...scopes]}`)
  assert.deepEqual([...autoSet(groups)], [])
})

test("golden E3002 2026: engineering core loads, breadth stays a choice", () => {
  const groups = extractFixture("E3002-2026")
  const auto = autoSet(groups)
  for (const code of ["ENG1005", "ENG1014", "ENG1011", "ENG1012", "ENG1013"])
    assert.ok(auto.has(code), `${code} must load`)
  const breadth = byGrouping(groups, "breadth")
  assert.ok(breadth)
  assert.equal(breadth.autoLoad, false)
})

test("golden D3001/D3002/S2004/B2008: no course-level subject units ⇒ empty groups is correct", () => {
  // These courses carry all units via AoS / component courses. The
  // webapp must surface the component card anyway (missingTemplate).
  for (const name of ["D3001-2026", "D3002-2026", "S2004-2026", "B2008-2026"]) {
    const groups = extractFixture(name)
    assert.deepEqual(groups, [], `${name} has zero subject leaves`)
  }
})

/* ------------------------------------------------------------------ *
 * detectScope
 * ------------------------------------------------------------------ */

test("detectScope: corpus title forms", () => {
  assert.equal(detectScope("Core studies - Malaysia"), "Malaysia")
  assert.equal(detectScope("Part A. Core studies - SEU"), "SEU")
  assert.equal(detectScope("Additional coursework studies (Clayton)"), "Clayton")
  assert.equal(detectScope("CLAYTON: Mathematical science units"), "Clayton")
  assert.equal(detectScope("Malaysia students"), "Malaysia")
  assert.equal(detectScope("a. Malaysia"), "Malaysia")
  assert.equal(detectScope("Clayton options"), "Clayton")
  assert.equal(
    detectScope("Part E. Indonesian studies - For the Indonesia offering only"),
    "Indonesia",
  )
  assert.equal(detectScope("Indonesian studies"), "Indonesia")
  assert.equal(
    detectScope("b. Caulfield and Malaysia"),
    "Caulfield and Malaysia",
  )
  assert.equal(detectScope("Monash University Malaysia (MUM) students"), "Malaysia")
})

test("detectScope: non-scoping mentions return null", () => {
  assert.equal(detectScope("Accreditation in Malaysia - IMPORTANT INFORMATION"), null)
  assert.equal(detectScope("Part A. Core studies"), null)
  assert.equal(detectScope("Free elective studies"), null)
})

/* ------------------------------------------------------------------ *
 * applyCurriculumOverrides
 * ------------------------------------------------------------------ */

const baseGroups = (): RequirementGroup[] => [
  { grouping: "Core", required: 2, options: ["U1", "U2"], autoLoad: true },
  { grouping: "Pick one", required: 1, options: ["U3", "U4"], autoLoad: false },
]

test("overrides: year filter and course filter", () => {
  const ov = [
    {
      course: "X1234",
      years: ["2025"],
      reason: "test",
      ops: [{ op: "setAutoLoad" as const, groupingLike: "core", autoLoad: false }],
    },
  ]
  const miss = applyCurriculumOverrides("X1234", "2026", baseGroups(), ov)
  assert.equal(miss.applied.length, 0)
  const hit = applyCurriculumOverrides("x1234", "2025", baseGroups(), ov)
  assert.equal(hit.applied.length, 1)
  assert.equal(hit.groups[0]!.autoLoad, false)
})

test("overrides: op behaviours", () => {
  const groups = baseGroups()
  const { groups: out } = applyCurriculumOverrides("C1", "2026", groups, [
    {
      course: "C1",
      reason: "test",
      ops: [
        { op: "setRequired", groupingLike: "pick one", required: 5 },
        { op: "removeOption", groupingLike: "core", code: "u2" },
        {
          op: "addGroup",
          group: { grouping: "Extra", required: 1, options: ["U9"], autoLoad: true },
        },
        { op: "removeGroup", groupingLike: "pick one" },
      ],
    },
  ])
  assert.deepEqual(
    out.map((g) => g.grouping),
    ["Core", "Extra"],
  )
  assert.deepEqual(out[0]!.options, ["U1"])
  assert.equal(out[0]!.required, 1, "required clamps to remaining options")
  // Inputs must not be mutated.
  assert.deepEqual(groups[0]!.options, ["U1", "U2"])
})

test("overrides: validation rejects malformed entries", () => {
  assert.throws(() => validateCurriculumOverrides([{ course: "X" }]))
  assert.throws(() =>
    validateCurriculumOverrides([
      { course: "X", reason: "r", ops: [{ op: "explode" }] },
    ]),
  )
  assert.doesNotThrow(() =>
    validateCurriculumOverrides([
      {
        course: "X",
        reason: "r",
        ops: [{ op: "removeGroup", groupingLike: "y" }],
      },
    ]),
  )
})
