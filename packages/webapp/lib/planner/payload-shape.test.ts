import { test } from "node:test"
import assert from "node:assert/strict"

import { slimRequisiteRule } from "../db/requisite-rule.ts"
import { ruleSegs, plain } from "../handbook/summary.ts"
import {
  evaluateProhibition,
  evaluateRequisiteTree,
  referencedCodes,
} from "./requisites.ts"
import { plannerUnitCodes, type RequisiteRule } from "./types.ts"

// A leaf as CourseLoop stores it (FIT2004's 2026 prerequisite, cut down).
function leaf(code: string, name: string, extra: object = {}) {
  return {
    cl_id: "3c69b8a71b3c5550653b206b274bcb20",
    order: "3",
    abbr_name: name.toUpperCase().slice(0, 18),
    academic_item: {
      key: "code",
      type: "x_f5sl_cl_subjects",
      cl_id: "3c69b8a71b3c5550653b206b274bcb20",
      value: `Unit: ${code}`,
    },
    parent_record: { key: "title", cl_id: "bcd4", value: "Container 1.2" },
    academic_item_url: `/2023/units/${code}`,
    academic_item_code: code,
    academic_item_name: name,
    academic_item_type: { label: "Unit", value: "subject" },
    abbreviated_name_and_major: null,
    academic_item_version_name: "2023.01RO",
    academic_item_credit_points: "6",
    ...extra,
  }
}

const RAW = [
  {
    cl_id: "f4d49f2647224b10448f409b136d43cd",
    title: "Container 1",
    parent_connector: { label: "AND", value: "AND" },
    parent_container_table: "x_f5sl_cl_relationship_groups",
    relationships: [],
    containers: [
      {
        cl_id: "bcd49f2647224b10448f409b136d43ce",
        title: "Container 1.2",
        containers: [],
        parent_record: { key: "title", value: "Relationship Groups" },
        parent_connector: { label: "OR", value: "OR" },
        relationships: [
          leaf("FIT1008", "Introduction to computer science"),
          leaf("FIT1054", "Fundamentals of algorithms (Advanced)"),
          leaf("FIT2085", "Fundamentals of algorithms for engineers"),
        ],
      },
      {
        cl_id: "b4d49f2647224b10448f409b136d43cf",
        title: "Container 1.6",
        containers: [],
        parent_connector: { label: "OR", value: "OR" },
        relationships: [
          leaf("MAT1830", "Discrete mathematics for computer science"),
          leaf("ENG1005", "Engineering mathematics"),
        ],
      },
    ],
  },
]

test("the slim rule keeps only connector, containers, code and name", () => {
  const slim = slimRequisiteRule(RAW)
  assert.deepEqual(slim, [
    {
      parent_connector: { value: "AND" },
      containers: [
        {
          parent_connector: { value: "OR" },
          relationships: [
            {
              academic_item_code: "FIT1008",
              academic_item_name: "Introduction to computer science",
            },
            {
              academic_item_code: "FIT1054",
              academic_item_name: "Fundamentals of algorithms (Advanced)",
            },
            {
              academic_item_code: "FIT2085",
              academic_item_name: "Fundamentals of algorithms for engineers",
            },
          ],
        },
        {
          parent_connector: { value: "OR" },
          relationships: [
            {
              academic_item_code: "MAT1830",
              academic_item_name: "Discrete mathematics for computer science",
            },
            {
              academic_item_code: "ENG1005",
              academic_item_name: "Engineering mathematics",
            },
          ],
        },
      ],
    },
  ])
  assert.ok(JSON.stringify(slim).length < JSON.stringify(RAW).length / 4)
})

test("the slim rule drives validation and summaries exactly like the raw rule", () => {
  const raw = RAW as unknown as RequisiteRule
  const slim = slimRequisiteRule(RAW)!
  for (const done of [
    [],
    ["FIT1008"],
    ["FIT1008", "MAT1830"],
    ["FIT2085", "ENG1005"],
    ["MAT1830", "ENG1005"],
  ]) {
    const set = new Set(done)
    assert.deepEqual(
      evaluateRequisiteTree(slim, set),
      evaluateRequisiteTree(raw, set)
    )
    assert.deepEqual(
      evaluateProhibition(slim, set),
      evaluateProhibition(raw, set)
    )
  }
  assert.deepEqual(referencedCodes(slim), referencedCodes(raw))
  assert.equal(plain(ruleSegs(slim)!), plain(ruleSegs(raw)!))
})

test("a leaf without a code still blocks an AND", () => {
  const slim = slimRequisiteRule([
    {
      parent_connector: { value: "AND" },
      relationships: [
        leaf("FIT1008", "x"),
        { academic_item_name: "Permission required" },
      ],
    },
  ])!
  assert.equal(slim[0].relationships?.[1].academic_item_code, "")
  assert.equal(
    evaluateRequisiteTree(slim, new Set(["FIT1008"])).satisfied,
    false
  )
})

test("odd stored rules slim to null or an empty tree", () => {
  assert.equal(slimRequisiteRule(null), null)
  assert.equal(slimRequisiteRule({ container: [] }), null)
  assert.deepEqual(slimRequisiteRule([null, 3, {}]), [{}])
})

test("plannerUnitCodes covers AoS, course and component units once each", () => {
  const u = (code: string) => ({ code, grouping: "Core" })
  assert.deepEqual(
    plannerUnitCodes({
      areasOfStudy: [
        {
          code: "SFTWRDEV08",
          title: "Software development",
          kind: "major",
          relationshipLabel: "Majors",
          creditPoints: 48,
          units: [u("FIT1045"), u("FIT2004")],
          requiredUnits: [],
          requirements: [],
        },
      ],
      courseUnits: [u("FIT1045"), u("FIT1047")],
      componentCourses: [
        {
          componentTitle: "Science component",
          courseCode: "S2000",
          courseTitle: "Bachelor of Science",
          courseUnits: [u("SCI1000")],
          courseRequirements: [],
        },
      ],
    }),
    ["FIT1045", "FIT2004", "FIT1047", "SCI1000"]
  )
})
