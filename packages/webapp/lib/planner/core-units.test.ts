import { test } from "node:test"
import assert from "node:assert/strict"

import { unitIsCore } from "./core-units.ts"
import type { PlannerCourseWithAoS } from "./types.ts"

const group = (
  grouping: string,
  options: string[],
  required = options.length,
  autoLoad?: boolean
) => ({
  grouping,
  options,
  required,
  ...(autoLoad === undefined ? {} : { autoLoad }),
})

const course = (
  over: Partial<PlannerCourseWithAoS> = {}
): PlannerCourseWithAoS =>
  ({
    year: "2026",
    code: "E3001",
    title: "Bachelor of Engineering (Honours)",
    creditPoints: 192,
    aqfLevel: null,
    type: null,
    overview: null,
    areasOfStudy: [],
    courseUnits: [],
    courseRequirements: [],
    componentCourses: [],
    ...over,
  }) as PlannerCourseWithAoS

const aos = (code: string, requirements: ReturnType<typeof group>[]) =>
  ({
    code,
    title: code,
    kind: "specialisation",
    relationshipLabel: "",
    creditPoints: 144,
    units: [],
    requiredUnits: [],
    requirements,
  }) as unknown as PlannerCourseWithAoS["areasOfStudy"][number]

test("core: a proven-mandatory course group marks its units", () => {
  const c = course({
    courseRequirements: [
      group("Engineering fundamentals", ["ENG1014", "ENG1005"]),
    ],
  })
  assert.equal(unitIsCore("ENG1014", c, new Set()), true)
})

test("core: a choice group does NOT mark its units (E3001 breadth, 1 of 21)", () => {
  const c = course({
    courseRequirements: [
      group(
        "First year engineering breadth studies",
        ["BMS1021", "CHM1011", "ENG1021"],
        1,
        false
      ),
    ],
  })
  assert.equal(unitIsCore("CHM1011", c, new Set()), false)
})

test('core: a "core"-titled pick-one list is not core (ECSYSENG04 Core List B)', () => {
  // The exact regression a student reported: ECE5882, a level-5 unit in
  // a 1-of-22 list, wore the Core badge because the title said "Core".
  const c = course({
    areasOfStudy: [
      aos("ECSYSENG04", [
        group("Core List B", ["ECE5882", "ECE4171", "ECE4176"], 1, false),
      ]),
    ],
  })
  assert.equal(unitIsCore("ECE5882", c, new Set(["ECSYSENG04"])), false)
})

test("core: an AoS counts only once the student picks it", () => {
  const c = course({
    areasOfStudy: [
      aos("ROBMCTRN04", [group("Part C", ["MMA2005", "ENG2005"])]),
    ],
  })
  assert.equal(unitIsCore("MMA2005", c, new Set()), false, "not picked")
  assert.equal(
    unitIsCore("MMA2005", c, new Set(["ROBMCTRN04"])),
    true,
    "picked"
  )
})

test("core: a component's mandatory group marks units in a double degree", () => {
  const c = course({
    componentCourses: [
      {
        componentTitle: "Engineering component",
        courseCode: "E3001",
        courseTitle: "Bachelor of Engineering (Honours)",
        courseUnits: [],
        courseRequirements: [
          group("Engineering design", ["ENG1013", "ENG1014"]),
        ],
      },
    ] as PlannerCourseWithAoS["componentCourses"],
  })
  assert.equal(unitIsCore("ENG1013", c, new Set()), true)
})

test("core: legacy rows with no autoLoad fall back to the credit-point rule", () => {
  const c = course({ courseRequirements: [group("Core units", ["FIT1045"])] })
  assert.equal(unitIsCore("FIT1045", c, new Set()), true)
  const choice = course({
    courseRequirements: [group("Pick one", ["FIT1049", "FIT1055"], 1)],
  })
  assert.equal(unitIsCore("FIT1049", choice, new Set()), false)
})
