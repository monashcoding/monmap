import type { PlannerAreaOfStudy, PlannerCourseWithAoS } from "./types.ts"

/**
 * Campus scoping for area-of-study options and requirement groups.
 *
 * Monash publishes no structured campus field. Scope survives only in
 * container titles ("Core studies - Malaysia", "CLAYTON: …"), which
 * ingest reads into `course_areas_of_study.scope` and
 * `RequirementGroup.scope`. Across all seven ingested years the corpus
 * uses exactly three values — "Clayton", "Malaysia" and
 * "Caulfield and Clayton" — so scope is a *set* of campuses, not one.
 *
 * That is the whole reason this module exists rather than an equality
 * check: a Clayton student must see options scoped
 * "Caulfield and Clayton", and a Caulfield student must see the same
 * option, so matching is token-wise.
 */

/** Split a scope label into the campuses it covers. */
export function campusTokens(scope: string | null | undefined): string[] {
  if (!scope) return []
  return scope
    .split(/\s+and\s+|,/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Does a scoped item belong to this campus?
 *
 * Unscoped items match every campus — that is what "no scope" means in
 * the corpus, and it is also what keeps plans with no campus set
 * behaving exactly as they did before this feature.
 */
export function scopeMatchesCampus(
  scope: string | null | undefined,
  campus: string | null | undefined
): boolean {
  if (!campus) return true
  const tokens = campusTokens(scope)
  if (tokens.length === 0) return true
  return tokens.some((t) => t.toLowerCase() === campus.toLowerCase())
}

/**
 * Every campus this course actually mentions, for the picker.
 *
 * Derived from the corpus rather than hardcoded, so a new campus
 * appears on its own — but in practice this returns at most three
 * entries, which is why the control can be a plain select.
 */
export function availableCampuses(course: PlannerCourseWithAoS): string[] {
  const out = new Set<string>()
  for (const a of course.areasOfStudy)
    for (const t of campusTokens(a.scope)) out.add(t)
  const groups = [
    ...course.courseRequirements,
    ...course.componentCourses.flatMap((c) => c.courseRequirements),
    ...course.areasOfStudy.flatMap((a) => a.requirements),
  ]
  for (const g of groups) for (const t of campusTokens(g.scope)) out.add(t)
  return [...out].sort((a, b) => a.localeCompare(b))
}

/**
 * The campus an option really belongs to.
 *
 * `scope` is populated at ingest from the ancestor path, but only for
 * rows in `course_areas_of_study`. Virtual areas of study — the ones
 * the resolver synthesises from embedded specialisations — carry no
 * scope column, and their campus survives only in the relationship
 * label ("Clayton options", "Malaysia options"). Without this fallback
 * a Malaysia student is still shown a picker headed
 * "Clayton options specialisation".
 *
 * Matching is restricted to campuses the course already demonstrates
 * elsewhere, so an unrelated label that happens to contain a place
 * name cannot invent a scope.
 */
export function effectiveScope(
  aos: Pick<PlannerAreaOfStudy, "scope" | "relationshipLabel">,
  knownCampuses: readonly string[]
): string | null {
  if (aos.scope) return aos.scope
  const label = (aos.relationshipLabel ?? "").toLowerCase()
  if (!label) return null
  const hits = knownCampuses.filter((c) => label.includes(c.toLowerCase()))
  return hits.length > 0 ? hits.join(" and ") : null
}

/**
 * Options to show for a slot at this campus.
 *
 * `keepCode` is the student's current pick and is always retained even
 * when it falls outside the campus. Dropping it would blank the select
 * and silently discard a decision they made — the picker flags it
 * instead (see `isOutOfCampusScope`).
 */
export function optionsForCampus(
  options: readonly PlannerAreaOfStudy[],
  campus: string | null | undefined,
  keepCode?: string | undefined,
  knownCampuses: readonly string[] = []
): PlannerAreaOfStudy[] {
  if (!campus) return [...options]
  return options.filter(
    (o) =>
      o.code === keepCode ||
      scopeMatchesCampus(effectiveScope(o, knownCampuses), campus)
  )
}

/** True when a picked AoS isn't offered at the chosen campus. */
export function isOutOfCampusScope(
  aos: Pick<PlannerAreaOfStudy, "scope" | "relationshipLabel">,
  campus: string | null | undefined,
  knownCampuses: readonly string[] = []
): boolean {
  return !scopeMatchesCampus(effectiveScope(aos, knownCampuses), campus)
}

/**
 * The course as it applies at the chosen campus: every requirement
 * group scoped to a different campus is dropped, at course level,
 * component level and inside each area of study.
 *
 * This is the half of campus support students actually complained
 * about — "its telling me i need to take some units in malaysia".
 * A scoped group the student can never take was inflating the
 * denominator of their progress and listing units they cannot enrol
 * in.
 *
 * `areasOfStudy` themselves are left alone: which options to *offer*
 * is the picker's business (`optionsForCampus`), and narrowing them
 * here would make a pick vanish from the requirements panel rather
 * than be flagged.
 *
 * Returns the input unchanged when no campus is set, so identity is
 * stable and memoized consumers don't re-render.
 */
export function courseForCampus(
  course: PlannerCourseWithAoS,
  campus: string | null | undefined
): PlannerCourseWithAoS {
  if (!campus) return course
  const keep = <T extends { scope?: string | null }>(groups: readonly T[]) =>
    groups.filter((g) => scopeMatchesCampus(g.scope, campus))
  return {
    ...course,
    courseRequirements: keep(course.courseRequirements),
    componentCourses: course.componentCourses.map((c) => ({
      ...c,
      courseRequirements: keep(c.courseRequirements),
    })),
    areasOfStudy: course.areasOfStudy.map((a) => ({
      ...a,
      requirements: keep(a.requirements),
    })),
  }
}
