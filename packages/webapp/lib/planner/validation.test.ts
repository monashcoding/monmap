import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isOfferedInPeriod,
  keyFor,
  validatePlan,
  validateUnitInSlot,
} from "./validation.ts";
import type {
  PlannerOffering,
  PlannerState,
  PlannerUnit,
  RequisiteBlock,
} from "./types.ts";

function unit(
  code: string,
  overrides: Partial<PlannerUnit> = {},
): PlannerUnit {
  return {
    year: "2026",
    code,
    title: `${code} title`,
    creditPoints: 6,
    level: "Level 1",
    synopsis: null,
    school: null,
    ...overrides,
  };
}

function offering(
  code: string,
  periodKind: PlannerOffering["periodKind"],
): PlannerOffering {
  return {
    unitCode: code,
    teachingPeriod: "First semester",
    location: "Clayton",
    attendanceModeCode: "ON-CAMPUS",
    periodKind,
  };
}

test("isOfferedInPeriod: matches on periodKind", () => {
  const offerings = [offering("FIT1045", "S1"), offering("FIT1045", "S2")];
  assert.equal(isOfferedInPeriod(offerings, "S1"), true);
  assert.equal(isOfferedInPeriod(offerings, "SUMMER_A"), false);
});

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
  });
  assert.equal(v.errors.length, 1);
  assert.equal(v.errors[0].kind, "not_offered_in_period");
});

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
  ];
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
  });
  const prereqErr = v.errors.find((e) => e.kind === "prereq_unmet");
  assert.ok(prereqErr);
  assert.deepEqual(prereqErr.relatedCodes, ["FIT1008", "FIT1054"]);
});

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
  ];
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
  });
  assert.equal(v.errors.length, 0);
});

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
  ];
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
  });
  const pe = v.errors.find((e) => e.kind === "prohibition_conflict");
  assert.ok(pe);
  assert.deepEqual(pe.relatedCodes, ["FIT1045"]);
});

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
  });
  assert.equal(v.errors.length, 0);
  assert.equal(v.warnings.length, 1);
  assert.equal(v.warnings[0].kind, "over_credit_load");
});

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
  };

  const unitsByCode = new Map<string, PlannerUnit>([
    ["FIT1045", unit("FIT1045")],
    ["FIT2004", unit("FIT2004")],
  ]);
  const offeringsByCode = new Map<string, PlannerOffering[]>([
    ["FIT1045", [offering("FIT1045", "S1"), offering("FIT1045", "S2")]],
    ["FIT2004", [offering("FIT2004", "S1"), offering("FIT2004", "S2")]],
  ]);
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
  ]);

  const out = validatePlan(state, unitsByCode, offeringsByCode, requisitesByCode);
  const fit2004 = out.get(keyFor(0, 1, "FIT2004"));
  assert.ok(fit2004);
  assert.equal(fit2004.errors.length, 0);
});

test("validatePlan: prereq fails when dependent unit is in same slot (not before)", () => {
  const state: PlannerState = {
    courseYear: "2026",
    courseCode: "C2000",
    selectedAos: {},
    years: [
      {
        label: "Year 1",
        slots: [
          { kind: "S1", unitCodes: ["FIT1045", "FIT2004"] },
        ],
      },
    ],
  };
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
    ]),
  );
  const fit2004 = out.get(keyFor(0, 0, "FIT2004"));
  assert.ok(fit2004);
  assert.ok(fit2004.errors.some((e) => e.kind === "prereq_unmet"));
});

test("validatePlan: unknown unit yields an unknown_unit error", () => {
  const state: PlannerState = {
    courseYear: "2026",
    courseCode: "C2000",
    selectedAos: {},
    years: [
      { label: "Year 1", slots: [{ kind: "S1", unitCodes: ["ZZZ9999"] }] },
    ],
  };
  const out = validatePlan(state, new Map(), new Map(), new Map());
  const v = out.get(keyFor(0, 0, "ZZZ9999"));
  assert.ok(v);
  assert.equal(v.errors[0].kind, "unknown_unit");
});
