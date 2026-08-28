import { test } from "node:test"
import assert from "node:assert/strict"

import {
  isOfferedInPeriod,
  keyFor,
  validatePlan,
  validateUnitInSlot,
} from "./validation.ts"
import type {
  PlannerOffering,
  PlannerState,
  PlannerUnit,
  RequisiteBlock,
} from "./types.ts"

function unit(code: string, overrides: Partial<PlannerUnit> = {}): PlannerUnit {
  return {
    year: "2026",
    code,
    title: `${code} title`,
    creditPoints: 6,
    level: "Level 1",
    synopsis: null,
    school: null,
    ...overrides,
  }
}

function offering(
  code: string,
  periodKind: PlannerOffering["periodKind"]
): PlannerOffering {
  return {
    unitCode: code,
    teachingPeriod: "First semester",
    location: "Clayton",
    attendanceModeCode: "ON-CAMPUS",
    periodKind,
  }
}

test("isOfferedInPeriod: matches on periodKind", () => {
  const offerings = [offering("FIT1045", "S1"), offering("FIT1045", "S2")]
  assert.equal(isOfferedInPeriod(offerings, "S1"), true)
  assert.equal(isOfferedInPeriod(offerings, "SUMMER_A"), false)
})

test("validateUnitInSlot: flags 'not offered' when period has no offering", () => {
  const v = validateUnitInSlot({
    unit: unit("FIT1045"),
    slotKind: "SUMMER_A",
    yearIndex: 0,
    slotIndex: 0,
    completedBefore: new Set(),
    concurrentWith: new Set(),
    allPlannedCodes: new Set(),
    offerings: [offering("FIT1045", "S1")],
    requisites: [],
    slotCreditLoad: 6,
  })
  assert.equal(v.errors.length, 1)
  assert.equal(v.errors[0].kind, "not_offered_in_period")
})

test("validateUnitInSlot: future-year 'not offered' is a warning, not an error", () => {
  // Same slot mismatch as above, but the slot represents 2027 while
  // the unit data we loaded is from the 2026 handbook (the latest
  // published). Period mismatch is a stale-data forecast, not a hard
  // fact — downgrade to amber and surface the year gap in the message.
  const v = validateUnitInSlot({
    unit: unit("FIT1045", { year: "2026" }),
    slotKind: "SUMMER_A",
    yearIndex: 0,
    slotIndex: 0,
    completedBefore: new Set(),
    concurrentWith: new Set(),
    allPlannedCodes: new Set(),
    offerings: [offering("FIT1045", "S1")],
    requisites: [],
    slotCreditLoad: 6,
    expectedHandbookYear: "2027",
  })
  assert.equal(v.errors.length, 0)
  assert.equal(v.warnings.length, 1)
  assert.equal(v.warnings[0].kind, "not_offered_in_period")
  assert.match(v.warnings[0].message, /2026 handbook/)
  assert.match(v.warnings[0].message, /2027 offerings may differ/)
})

test("validateUnitInSlot: matching expectedHandbookYear keeps not-offered as a hard error", () => {
  // Slot represents 2026 and we loaded the 2026 handbook for it — no
  // stale-data excuse, so a period mismatch is a real blocker (red).
  const v = validateUnitInSlot({
    unit: unit("FIT1045", { year: "2026" }),
    slotKind: "SUMMER_A",
    yearIndex: 0,
    slotIndex: 0,
    completedBefore: new Set(),
    concurrentWith: new Set(),
    allPlannedCodes: new Set(),
    offerings: [offering("FIT1045", "S1")],
    requisites: [],
    slotCreditLoad: 6,
    expectedHandbookYear: "2026",
  })
  assert.equal(v.errors.length, 1)
  assert.equal(v.errors[0].kind, "not_offered_in_period")
  assert.equal(v.warnings.length, 0)
})

test("validateUnitInSlot: term-only schedule is always a warning, never an error", () => {
  // FIT3202-style: every offering classifies as OTHER (Term 1 / Term
  // 3 IBL onboarding). The unit can never match an S1/S2 slot on the
  // grid even when the data is fresh, so it always lands as amber.
  const v = validateUnitInSlot({
    unit: unit("FIT3202"),
    slotKind: "S2",
    yearIndex: 0,
    slotIndex: 1,
    completedBefore: new Set(),
    concurrentWith: new Set(),
    allPlannedCodes: new Set(),
    offerings: [
      { ...offering("FIT3202", "OTHER"), teachingPeriod: "Term 1" },
      { ...offering("FIT3202", "OTHER"), teachingPeriod: "Term 3" },
    ],
    requisites: [],
    slotCreditLoad: 0,
  })
  assert.equal(v.errors.length, 0)
  assert.equal(v.warnings.length, 1)
  assert.match(v.warnings[0].message, /non-standard schedule/)
  assert.match(v.warnings[0].message, /Term 1.*Term 3|Term 3.*Term 1/)
})

test("validateUnitInSlot: prereq unmet → error lists missing codes", () => {
  const requisites: RequisiteBlock[] = [
    {
      requisiteType: "prerequisite",
      rule: [
        {
          parent_connector: { value: "OR" },
          relationships: [
            { academic_item_code: "FIT1008" },
            { academic_item_code: "FIT1054" },
          ],
        },
      ],
    },
  ]
  const v = validateUnitInSlot({
    unit: unit("FIT2004"),
    slotKind: "S1",
    yearIndex: 1,
    slotIndex: 0,
    completedBefore: new Set(),
    concurrentWith: new Set(),
    allPlannedCodes: new Set(),
    offerings: [offering("FIT2004", "S1")],
    requisites,
    slotCreditLoad: 6,
  })
  const prereqErr = v.errors.find((e) => e.kind === "prereq_unmet")
  assert.ok(prereqErr)
  assert.deepEqual(prereqErr.relatedCodes, ["FIT1008", "FIT1054"])
})

test("validateUnitInSlot: coreq satisfied by concurrent unit", () => {
  const requisites: RequisiteBlock[] = [
    {
      requisiteType: "corequisite",
      rule: [
        {
          parent_connector: { value: "AND" },
          relationships: [{ academic_item_code: "FIT1045" }],
        },
      ],
    },
  ]
  const v = validateUnitInSlot({
    unit: unit("FIT9999"),
    slotKind: "S1",
    yearIndex: 0,
    slotIndex: 0,
    completedBefore: new Set(),
    concurrentWith: new Set(["FIT1045"]),
    allPlannedCodes: new Set(["FIT1045"]),
    offerings: [offering("FIT9999", "S1")],
    requisites,
    slotCreditLoad: 12,
  })
  assert.equal(v.errors.length, 0)
})

test("validateUnitInSlot: prohibition fires when paired unit is anywhere in plan", () => {
  const requisites: RequisiteBlock[] = [
    {
      requisiteType: "prohibition",
      rule: [
        {
          parent_connector: { value: "OR" },
          relationships: [{ academic_item_code: "FIT1045" }],
        },
      ],
    },
  ]
  const v = validateUnitInSlot({
    unit: unit("FIT1053"),
    slotKind: "S1",
    yearIndex: 0,
    slotIndex: 0,
    completedBefore: new Set(),
    concurrentWith: new Set(),
    allPlannedCodes: new Set(["FIT1045"]), // elsewhere in the plan
    offerings: [offering("FIT1053", "S1")],
    requisites,
    slotCreditLoad: 6,
  })
  const pe = v.errors.find((e) => e.kind === "prohibition_conflict")
  assert.ok(pe)
  assert.deepEqual(pe.relatedCodes, ["FIT1045"])
})

test("validateUnitInSlot: over-credit-load is a warning, not an error", () => {
  const v = validateUnitInSlot({
    unit: unit("FIT1045"),
    slotKind: "S1",
    yearIndex: 0,
    slotIndex: 0,
    completedBefore: new Set(),
    concurrentWith: new Set(),
    allPlannedCodes: new Set(),
    offerings: [offering("FIT1045", "S1")],
    requisites: [],
    slotCreditLoad: 30,
  })
  assert.equal(v.errors.length, 0)
  assert.equal(v.warnings.length, 1)
  assert.equal(v.warnings[0].kind, "over_credit_load")
})

test("validatePlan: units in earlier slots unlock later slots", () => {
  const state: PlannerState = {
    courseYear: "2026",
    courseCode: "C2000",
    selectedAos: {},
    years: [
      {
        label: "Year 1",
        slots: [
          { kind: "S1", unitCodes: ["FIT1045"] },
          { kind: "S2", unitCodes: ["FIT2004"] },
        ],
      },
    ],
  }

  const unitsByCode = new Map<string, PlannerUnit>([
    ["FIT1045", unit("FIT1045")],
    ["FIT2004", unit("FIT2004")],
  ])
  const offeringsByCode = new Map<string, PlannerOffering[]>([
    ["FIT1045", [offering("FIT1045", "S1"), offering("FIT1045", "S2")]],
    ["FIT2004", [offering("FIT2004", "S1"), offering("FIT2004", "S2")]],
  ])
  const requisitesByCode = new Map<string, RequisiteBlock[]>([
    [
      "FIT2004",
      [
        {
          requisiteType: "prerequisite",
          rule: [
            {
              parent_connector: { value: "OR" },
              relationships: [{ academic_item_code: "FIT1045" }],
            },
          ],
        },
      ],
    ],
  ])

  const out = validatePlan(
    state,
    unitsByCode,
    offeringsByCode,
    requisitesByCode
  )
  const fit2004 = out.get(keyFor(0, 1, "FIT2004"))
  assert.ok(fit2004)
  assert.equal(fit2004.errors.length, 0)
})

test("validatePlan: full-year twin doesn't double-charge slotCreditLoad", () => {
  // A 12 CP FY unit placed in S1 + S2 alongside three 6 CP units in
  // each semester. With per-slot FY accounting the load is 18 + 6 =
  // 24 = max, no warning. Before the fix the FY contributed its full
  // 12 CP to each half so the load read as 30 and warned in both S1
  // and S2 of every year a FY unit sat in.
  const state: PlannerState = {
    courseYear: "2026",
    courseCode: "C2000",
    selectedAos: {},
    years: [
      {
        label: "Year 1",
        slots: [
          { kind: "S1", unitCodes: ["A", "B", "C", "FY"] },
          { kind: "S2", unitCodes: ["D", "E", "F", "FY"] },
        ],
      },
    ],
  }
  const u = (c: string, cp = 6) => unit(c, { creditPoints: cp })
  const units = new Map<string, PlannerUnit>([
    ["A", u("A")],
    ["B", u("B")],
    ["C", u("C")],
    ["D", u("D")],
    ["E", u("E")],
    ["F", u("F")],
    ["FY", u("FY", 12)],
  ])
  const flat = (code: string, period: PlannerOffering["periodKind"]) => [
    offering(code, period),
  ]
  const offerings = new Map<string, PlannerOffering[]>([
    ["A", flat("A", "S1")],
    ["B", flat("B", "S1")],
    ["C", flat("C", "S1")],
    ["D", flat("D", "S2")],
    ["E", flat("E", "S2")],
    ["F", flat("F", "S2")],
    ["FY", flat("FY", "FULL_YEAR")],
  ])
  const out = validatePlan(state, units, offerings, new Map())
  const fy0 = out.get(keyFor(0, 0, "FY"))
  const fy1 = out.get(keyFor(0, 1, "FY"))
  assert.ok(fy0 && fy1)
  assert.equal(
    fy0.warnings.find((w) => w.kind === "over_credit_load"),
    undefined
  )
  assert.equal(
    fy1.warnings.find((w) => w.kind === "over_credit_load"),
    undefined
  )
})

test("validatePlan: prereq fails when dependent unit is in same slot (not before)", () => {
  const state: PlannerState = {
    courseYear: "2026",
    courseCode: "C2000",
    selectedAos: {},
    years: [
      {
        label: "Year 1",
        slots: [{ kind: "S1", unitCodes: ["FIT1045", "FIT2004"] }],
      },
    ],
  }
  const out = validatePlan(
    state,
    new Map([
      ["FIT1045", unit("FIT1045")],
      ["FIT2004", unit("FIT2004")],
    ]),
    new Map([
      ["FIT1045", [offering("FIT1045", "S1")]],
      ["FIT2004", [offering("FIT2004", "S1")]],
    ]),
    new Map([
      [
        "FIT2004",
        [
          {
            requisiteType: "prerequisite",
            rule: [
              {
                parent_connector: { value: "OR" },
                relationships: [{ academic_item_code: "FIT1045" }],
              },
            ],
          },
        ],
      ],
    ])
  )
  const fit2004 = out.get(keyFor(0, 0, "FIT2004"))
  assert.ok(fit2004)
  assert.ok(fit2004.errors.some((e) => e.kind === "prereq_unmet"))
})

test("validatePlan: not-offered severity tracks loaded-vs-slot year per study year", () => {
  // courseYear 2024 → slot calendar years 2024 / 2025 / 2026 / 2027.
  // Hydration fetches per-year handbook data; this test stubs the
  // result: Y1 has 2024 data, Y2 has 2025 data, Y3 has 2026 data, Y4
  // also got 2026 (handbookYearFor falls back to the latest available
  // when 2027 isn't published). FIT1045 doesn't offer in S1 in any of
  // them. Y1–Y3 should be red (data matches the slot year); only Y4
  // should be amber (slot year 2027 ≠ loaded year 2026).
  const state: PlannerState = {
    courseYear: "2024",
    courseCode: "C2000",
    selectedAos: {},
    years: [
      { label: "Year 1", slots: [{ kind: "S1", unitCodes: ["FIT1045"] }] },
      { label: "Year 2", slots: [{ kind: "S1", unitCodes: ["FIT1045"] }] },
      { label: "Year 3", slots: [{ kind: "S1", unitCodes: ["FIT1045"] }] },
      { label: "Year 4", slots: [{ kind: "S1", unitCodes: ["FIT1045"] }] },
    ],
  }

  // Per-slot unit data mimics what use-unit-data-hydration produces:
  // each study-year's slot gets a unit whose `year` is the handbook
  // year that was actually fetched. validatePlan currently looks units
  // up by code, so we model this by varying which year wins on lookup
  // per call — instead we use a Map per slot via a custom resolver.
  // Simpler: assert via separate validatePlan calls, one per "loaded"
  // year, since validatePlan keys offerings/units by code globally.

  // Y4 case: unit loaded from 2026 fallback, slot represents 2027.
  const y4State: PlannerState = {
    ...state,
    years: [state.years[3]],
  }
  const out4 = validatePlan(
    { ...y4State, courseYear: "2027" }, // year 0 = calendar 2027
    new Map([["FIT1045", unit("FIT1045", { year: "2026" })]]),
    new Map([["FIT1045", [offering("FIT1045", "S2")]]]),
    new Map()
  )
  const v4 = out4.get(keyFor(0, 0, "FIT1045"))
  assert.ok(v4)
  assert.equal(v4.errors.length, 0, "stale-year slot should be amber")
  assert.equal(v4.warnings.length, 1)
  assert.equal(v4.warnings[0].kind, "not_offered_in_period")
  assert.match(v4.warnings[0].message, /2026 handbook/)
  assert.match(v4.warnings[0].message, /2027 offerings may differ/)

  // Y2 case: unit loaded from 2025, slot represents 2025 (courseYear
  // 2024 + study year 1). Data matches → red error.
  const y2State: PlannerState = {
    courseYear: "2024",
    courseCode: "C2000",
    selectedAos: {},
    years: [
      { label: "Year 1", slots: [{ kind: "S1", unitCodes: [] }] },
      { label: "Year 2", slots: [{ kind: "S1", unitCodes: ["FIT1045"] }] },
    ],
  }
  const out2 = validatePlan(
    y2State,
    new Map([["FIT1045", unit("FIT1045", { year: "2025" })]]),
    new Map([["FIT1045", [offering("FIT1045", "S2")]]]),
    new Map()
  )
  const v2 = out2.get(keyFor(1, 0, "FIT1045"))
  assert.ok(v2)
  assert.equal(
    v2.errors.length,
    1,
    "year-N slot with matching loaded year should stay red"
  )
  assert.equal(v2.errors[0].kind, "not_offered_in_period")
  assert.equal(v2.warnings.length, 0)
})

test("validatePlan: an equivalent twin satisfies a prereq naming the other (issue #7: FIT1053 → FIT2175 needs FIT1045)", () => {
  const state: PlannerState = {
    courseYear: "2026",
    courseCode: "C2000",
    selectedAos: {},
    years: [
      {
        label: "Year 1",
        slots: [
          { kind: "S1", unitCodes: ["FIT1053"] },
          { kind: "S2", unitCodes: ["FIT2175"] },
        ],
      },
    ],
  }
  const unitsByCode = new Map<string, PlannerUnit>([
    // FIT1053 "Introduction to programming (Advanced)" is the equivalent
    // twin of FIT1045 — completing it should satisfy a FIT1045 prereq.
    ["FIT1053", unit("FIT1053", { equivalents: ["FIT1045"] })],
    ["FIT2175", unit("FIT2175")],
  ])
  const offeringsByCode = new Map<string, PlannerOffering[]>([
    ["FIT1053", [offering("FIT1053", "S1")]],
    ["FIT2175", [offering("FIT2175", "S2")]],
  ])
  const requisitesByCode = new Map<string, RequisiteBlock[]>([
    [
      "FIT2175",
      [
        {
          requisiteType: "prerequisite",
          rule: [
            {
              parent_connector: { value: "AND" },
              relationships: [{ academic_item_code: "FIT1045" }],
            },
          ],
        },
      ],
    ],
  ])
  const out = validatePlan(
    state,
    unitsByCode,
    offeringsByCode,
    requisitesByCode
  )
  const fit2175 = out.get(keyFor(0, 1, "FIT2175"))
  assert.ok(fit2175)
  assert.equal(
    fit2175.errors.find((e) => e.kind === "prereq_unmet"),
    undefined
  )
})

test("validatePlan: a completed unit WITHOUT an equivalence link does not satisfy the prereq (pick-one alternatives stay unmet)", () => {
  // Same shape as above but FIT1053 carries no `equivalents` — proves
  // the expansion is gated on the equivalence link, not on any completed
  // unit, so genuinely different mutually-prohibited units (capstones,
  // alternatives) never cross-satisfy.
  const state: PlannerState = {
    courseYear: "2026",
    courseCode: "C2000",
    selectedAos: {},
    years: [
      {
        label: "Year 1",
        slots: [
          { kind: "S1", unitCodes: ["FIT1053"] },
          { kind: "S2", unitCodes: ["FIT2175"] },
        ],
      },
    ],
  }
  const out = validatePlan(
    state,
    new Map([
      ["FIT1053", unit("FIT1053")],
      ["FIT2175", unit("FIT2175")],
    ]),
    new Map([
      ["FIT1053", [offering("FIT1053", "S1")]],
      ["FIT2175", [offering("FIT2175", "S2")]],
    ]),
    new Map([
      [
        "FIT2175",
        [
          {
            requisiteType: "prerequisite",
            rule: [
              {
                parent_connector: { value: "AND" },
                relationships: [{ academic_item_code: "FIT1045" }],
              },
            ],
          },
        ],
      ],
    ])
  )
  const fit2175 = out.get(keyFor(0, 1, "FIT2175"))
  assert.ok(fit2175)
  assert.ok(fit2175.errors.some((e) => e.kind === "prereq_unmet"))
})

test("validatePlan: unknown unit yields an unknown_unit error", () => {
  const state: PlannerState = {
    courseYear: "2026",
    courseCode: "C2000",
    selectedAos: {},
    years: [
      { label: "Year 1", slots: [{ kind: "S1", unitCodes: ["ZZZ9999"] }] },
    ],
  }
  const out = validatePlan(state, new Map(), new Map(), new Map())
  const v = out.get(keyFor(0, 0, "ZZZ9999"))
  assert.ok(v)
  assert.equal(v.errors[0].kind, "unknown_unit")
})

/* ------------------------------------------------------------------ *
 * Advanced standing
 * ------------------------------------------------------------------ */

const prereqOn = (code: string, requires: string) =>
  new Map<string, RequisiteBlock[]>([
    [
      code,
      [
        {
          requisiteType: "prerequisite",
          rule: [
            {
              parent_connector: { value: "OR" },
              relationships: [{ academic_item_code: requires }],
            },
          ],
        },
      ],
    ],
  ])

test("credit: a credited prerequisite satisfies a unit in year 1", () => {
  // The exact complaint: "I got credit for intro to programming from
  // VCE Algorithmics and i cannot make the prereq for fit1008 go away".
  const state: PlannerState = {
    courseYear: "2026",
    courseCode: "C2000",
    selectedAos: {},
    credit: [{ code: "FIT1045", creditPoints: 6, label: "VCE Algorithmics" }],
    years: [
      { label: "Year 1", slots: [{ kind: "S1", unitCodes: ["FIT1008"] }] },
    ],
  }
  const units = new Map([["FIT1008", unit("FIT1008")]])
  const offerings = new Map([["FIT1008", [offering("FIT1008", "S1")]]])

  const out = validatePlan(
    state,
    units,
    offerings,
    prereqOn("FIT1008", "FIT1045")
  )
  const v = out.get(keyFor(0, 0, "FIT1008"))
  assert.ok(v)
  assert.deepEqual(v.errors, [], "credit counts as completed before year 1")
})

test("credit: without the credit the same plan still errors", () => {
  // Guards the test above against passing for the wrong reason.
  const state: PlannerState = {
    courseYear: "2026",
    courseCode: "C2000",
    selectedAos: {},
    years: [
      { label: "Year 1", slots: [{ kind: "S1", unitCodes: ["FIT1008"] }] },
    ],
  }
  const units = new Map([["FIT1008", unit("FIT1008")]])
  const offerings = new Map([["FIT1008", [offering("FIT1008", "S1")]]])

  const out = validatePlan(
    state,
    units,
    offerings,
    prereqOn("FIT1008", "FIT1045")
  )
  assert.equal(
    out.get(keyFor(0, 0, "FIT1008"))!.errors[0]?.kind,
    "prereq_unmet"
  )
})

test("credit: an equivalent twin held as credit satisfies the prerequisite", () => {
  // Credit for the advanced twin FIT1053 must satisfy a prereq naming
  // FIT1045, exactly as taking it would.
  const state: PlannerState = {
    courseYear: "2026",
    courseCode: "C2000",
    selectedAos: {},
    credit: [{ code: "FIT1053", creditPoints: 6 }],
    years: [
      { label: "Year 1", slots: [{ kind: "S1", unitCodes: ["FIT1008"] }] },
    ],
  }
  const units = new Map([
    ["FIT1008", unit("FIT1008")],
    ["FIT1053", unit("FIT1053", { equivalents: ["FIT1045"] })],
  ])
  const offerings = new Map([["FIT1008", [offering("FIT1008", "S1")]]])

  const out = validatePlan(
    state,
    units,
    offerings,
    prereqOn("FIT1008", "FIT1045")
  )
  assert.deepEqual(out.get(keyFor(0, 0, "FIT1008"))!.errors, [])
})

test("credit: a credited unit still trips a prohibition", () => {
  // Credit is a literal enrolment for prohibition purposes — holding
  // credit for a unit conflicts with its twin just as taking it would.
  const state: PlannerState = {
    courseYear: "2026",
    courseCode: "C2000",
    selectedAos: {},
    credit: [{ code: "FIT1045", creditPoints: 6 }],
    years: [
      { label: "Year 1", slots: [{ kind: "S1", unitCodes: ["FIT1053"] }] },
    ],
  }
  const units = new Map([["FIT1053", unit("FIT1053")]])
  const offerings = new Map([["FIT1053", [offering("FIT1053", "S1")]]])
  const requisites = new Map<string, RequisiteBlock[]>([
    [
      "FIT1053",
      [
        {
          requisiteType: "prohibition",
          rule: [
            {
              parent_connector: { value: "OR" },
              relationships: [{ academic_item_code: "FIT1045" }],
            },
          ],
        },
      ],
    ],
  ])

  const out = validatePlan(state, units, offerings, requisites)
  assert.equal(
    out.get(keyFor(0, 0, "FIT1053"))!.errors[0]?.kind,
    "prohibition_conflict"
  )
})

/* ------------------------------------------------------------------ *
 * One-directional prohibitions
 * ------------------------------------------------------------------ */

test("validatePlan: a one-directional prohibition flags BOTH units", () => {
  // Real 2026 shape: ATS2146 prohibits ATS3146, and ATS3146 says
  // nothing back — 1,557 of the corpus's 3,041 prohibition edges are
  // one-directional like this. Reported as: "when i put ats 3146 and
  // ats 2146 only 2146 showed a prohibition but 3146 didnt".
  const state: PlannerState = {
    courseYear: "2026",
    courseCode: "A2000",
    selectedAos: {},
    years: [
      {
        label: "Year 1",
        slots: [{ kind: "S1", unitCodes: ["ATS2146", "ATS3146"] }],
      },
    ],
  }
  const units = new Map([
    ["ATS2146", unit("ATS2146")],
    ["ATS3146", unit("ATS3146")],
  ])
  const offerings = new Map([
    ["ATS2146", [offering("ATS2146", "S1")]],
    ["ATS3146", [offering("ATS3146", "S1")]],
  ])
  const requisites = new Map<string, RequisiteBlock[]>([
    [
      "ATS2146",
      [
        {
          requisiteType: "prohibition",
          rule: [
            {
              parent_connector: { value: "OR" },
              relationships: [{ academic_item_code: "ATS3146" }],
            },
          ],
        },
      ],
    ],
    // ATS3146 has no requisites at all — the asymmetry.
  ])

  const out = validatePlan(state, units, offerings, requisites)
  const a = out.get(keyFor(0, 0, "ATS2146"))!
  const b = out.get(keyFor(0, 0, "ATS3146"))!
  assert.equal(a.errors[0]?.kind, "prohibition_conflict", "the naming unit")
  assert.equal(b.errors[0]?.kind, "prohibition_conflict", "the named unit")
  assert.deepEqual(a.errors[0]?.relatedCodes, ["ATS3146"])
  assert.deepEqual(b.errors[0]?.relatedCodes, ["ATS2146"])
})

test("validatePlan: a mutual prohibition reports once per unit, not twice", () => {
  // Both directions recorded. Each card should still show a single
  // merged error naming the other unit.
  const state: PlannerState = {
    courseYear: "2026",
    courseCode: "C2000",
    selectedAos: {},
    years: [
      {
        label: "Year 1",
        slots: [{ kind: "S1", unitCodes: ["FIT1045", "FIT1053"] }],
      },
    ],
  }
  const units = new Map([
    ["FIT1045", unit("FIT1045")],
    ["FIT1053", unit("FIT1053")],
  ])
  const offerings = new Map([
    ["FIT1045", [offering("FIT1045", "S1")]],
    ["FIT1053", [offering("FIT1053", "S1")]],
  ])
  const prohibits = (other: string): RequisiteBlock[] => [
    {
      requisiteType: "prohibition",
      rule: [
        {
          parent_connector: { value: "OR" },
          relationships: [{ academic_item_code: other }],
        },
      ],
    },
  ]
  const requisites = new Map<string, RequisiteBlock[]>([
    ["FIT1045", prohibits("FIT1053")],
    ["FIT1053", prohibits("FIT1045")],
  ])

  const out = validatePlan(state, units, offerings, requisites)
  const a = out.get(keyFor(0, 0, "FIT1045"))!
  assert.equal(a.errors.length, 1, "one merged error, not one per direction")
  assert.deepEqual(a.errors[0]?.relatedCodes, ["FIT1053"])
})

test("validatePlan: a prohibited unit that isn't on the plan is ignored", () => {
  const state: PlannerState = {
    courseYear: "2026",
    courseCode: "A2000",
    selectedAos: {},
    years: [
      { label: "Year 1", slots: [{ kind: "S1", unitCodes: ["ATS2146"] }] },
    ],
  }
  const units = new Map([["ATS2146", unit("ATS2146")]])
  const offerings = new Map([["ATS2146", [offering("ATS2146", "S1")]]])
  const requisites = new Map<string, RequisiteBlock[]>([
    [
      "ATS2146",
      [
        {
          requisiteType: "prohibition",
          rule: [
            {
              parent_connector: { value: "OR" },
              relationships: [{ academic_item_code: "ATS3146" }],
            },
          ],
        },
      ],
    ],
  ])
  const out = validatePlan(state, units, offerings, requisites)
  assert.deepEqual(out.get(keyFor(0, 0, "ATS2146"))!.errors, [])
})
