export type MonashGradeCode = "HD" | "D" | "C" | "P" | "N"

export function markToGrade(mark: number): MonashGradeCode {
  if (mark >= 80) return "HD"
  if (mark >= 70) return "D"
  if (mark >= 60) return "C"
  if (mark >= 50) return "P"
  return "N"
}

export const GRADE_STYLES: Record<
  MonashGradeCode,
  { bg: string; text: string }
> = {
  HD: {
    bg: "bg-emerald-100 dark:bg-emerald-950",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  D: {
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-300",
  },
  C: {
    bg: "bg-yellow-100 dark:bg-yellow-950",
    text: "text-yellow-700 dark:text-yellow-300",
  },
  P: {
    bg: "bg-orange-100 dark:bg-orange-950",
    text: "text-orange-700 dark:text-orange-300",
  },
  N: {
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-700 dark:text-red-300",
  },
}

/**
 * Monash GPA grade values on the 4-point scale, Australian campuses
 * (monash.edu/students/admin/assessments/results/gpa). A mark-based
 * fail is a plain fail (0.3); near pass (0.7) and withdrawn fail (0.0)
 * have no mark, so the planner never produces them.
 */
export const GPA_VALUES: Record<MonashGradeCode, number> = {
  HD: 4,
  D: 3,
  C: 2,
  P: 1,
  N: 0.3,
}

export interface GradedUnit {
  mark: number
  creditPoints: number
  /** Handbook level string, e.g. "Level 1". */
  level?: string | null
}

/**
 * Monash weighted average mark: Σ(mark · cp · w) / Σ(cp · w), where w
 * is 0.5 for level 1 units and 1 otherwise. A missing level counts as
 * a later year so absent handbook data never halves a unit's weight.
 * Fails count. Null when nothing is graded.
 */
export function computeWam(units: readonly GradedUnit[]): number | null {
  let weighted = 0
  let weight = 0
  for (const u of units) {
    const w = u.level?.match(/\d+/)?.[0] === "1" ? 0.5 : 1
    weighted += u.mark * u.creditPoints * w
    weight += u.creditPoints * w
  }
  return weight === 0 ? null : weighted / weight
}

/**
 * Monash GPA: Σ(grade value · cp) / Σ cp, with no year weighting.
 * Null when nothing is graded.
 */
export function computeGpa(units: readonly GradedUnit[]): number | null {
  let points = 0
  let cp = 0
  for (const u of units) {
    points += GPA_VALUES[markToGrade(u.mark)] * u.creditPoints
    cp += u.creditPoints
  }
  return cp === 0 ? null : points / cp
}
