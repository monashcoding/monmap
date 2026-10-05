import { groupIsMandatory } from "../db/curriculum.ts"

import type { PlannerCourseWithAoS, RequirementGroup } from "./types.ts"

/**
 * The "core" units of a course — the ones something the student has
 * committed to actually requires. The planner computes this once per
 * change of course or picks, and each unit card reads it.
 *
 * "Core" means exactly what the auto-fill template means by it: the
 * credit-point maths proves every option in the group is required
 * (`groupIsMandatory`). It used to mean two looser things at once —
 * *any* course-level group, so E3001's "First year engineering breadth
 * studies" (a 1-of-21 choice) decorated 21 units; plus any AoS group
 * whose title merely *contained* the word "core", so ECSYSENG04's
 * "Core List B" (pick 1 of 22) and "Materials engineering core
 * elective" did too. Three students reported the badge as arbitrary,
 * one precisely: "ENG1014 (definitely a core unit) is not labeled as
 * core, but ECE5882 (a 5th year elective) is".
 *
 * Areas of study count only when the student has picked them: a unit
 * that is core in a major they didn't choose is not core for them.
 */
export function coreUnitCodes(
  course: PlannerCourseWithAoS | null,
  pickedAosCodes: ReadonlySet<string>
): Set<string> {
  const out = new Set<string>()
  if (!course) return out
  for (const g of courseRequirementGroups(course, pickedAosCodes))
    if (groupIsMandatory(g)) for (const code of g.options) out.add(code)
  return out
}

/** Is this one unit core? See coreUnitCodes. */
export function unitIsCore(
  code: string,
  course: PlannerCourseWithAoS | null,
  pickedAosCodes: ReadonlySet<string>
): boolean {
  return coreUnitCodes(course, pickedAosCodes).has(code)
}

/**
 * Every requirement group of a course: its own, each component
 * degree's, and its areas of study's — only the picked ones when
 * `pickedAosCodes` is given.
 */
export function courseRequirementGroups(
  course: Pick<
    PlannerCourseWithAoS,
    "courseRequirements" | "componentCourses" | "areasOfStudy"
  >,
  pickedAosCodes?: ReadonlySet<string>
): RequirementGroup[] {
  return [
    ...course.courseRequirements,
    ...course.componentCourses.flatMap((c) => c.courseRequirements),
    ...course.areasOfStudy
      .filter((a) => !pickedAosCodes || pickedAosCodes.has(a.code))
      .flatMap((a) => a.requirements),
  ]
}
