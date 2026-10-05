import { PERIOD_KIND_LABEL } from "./teaching-period.ts"
import type { PeriodKind, PlannerSlot, PlannerState } from "./types.ts"

/**
 * The plan as a timeline of teaching periods.
 *
 * A study year runs twelve months from the student's intake. With a
 * Semester 1 start that is S1, Winter, S2, then the summer after it;
 * with a Semester 2 start it is S2, Summer, S1, Winter. Slots inside a
 * year are kept in that order, so "completed before" (prerequisites)
 * follows real time, and every slot knows its calendar year.
 */

export type StartPeriod = "S1" | "S2"

export function startPeriodOf(
  state: Pick<PlannerState, "startPeriod">
): StartPeriod {
  return state.startPeriod === "S2" ? "S2" : "S1"
}

/**
 * Years a course needs at a full load (4 units, 24 credit points, a
 * semester): 144 credit points is 3 years. Falls back to 3 when the
 * course has no credit-point total.
 */
export function yearsNeeded(creditPoints: number | null | undefined): number {
  if (!creditPoints || creditPoints <= 0) return 3
  return Math.max(1, Math.ceil(creditPoints / 48))
}

/**
 * A plan nobody has started on: no units, credit or leave/exchange
 * semesters, and setup not finished or skipped. Picked areas of study
 * don't count — the course panel offers them while the setup card is
 * still open, and picking one must not skip Create my map.
 */
export function isFreshPlan(state: PlannerState): boolean {
  if (state.setupDone) return false
  if (state.credit && state.credit.length > 0) return false
  return state.years.every((y) =>
    y.slots.every((s) => s.unitCodes.length === 0 && !s.status)
  )
}

export function startYearOf(state: Pick<PlannerState, "courseYear">): number {
  return Number(state.courseYear) || new Date().getFullYear()
}

/**
 * Handbook year whose data the planner uses for study year
 * `studyYearIndex`: courseYear + index, or the latest published year
 * when that one doesn't exist yet (Year 4 of a 2024 plan with no 2027
 * handbook reads 2026). Hydration, validation and the search and
 * detail views all use this, so they agree on which data a slot shows.
 */
export function handbookYearFor(
  studyYearIndex: number,
  courseYear: string,
  availableYears: readonly string[]
): string {
  const target = String(Number(courseYear) + studyYearIndex)
  if (availableYears.includes(target)) return target
  return [...availableYears].sort().at(-1) ?? courseYear
}

const RANK: Record<StartPeriod, Record<PeriodKind, number>> = {
  // FULL_YEAR sits with the first semester it starts in; OTHER
  // ("Untitled" sections) always goes last.
  S1: {
    S1: 0,
    FULL_YEAR: 0.5,
    WINTER: 1,
    S2: 2,
    SUMMER_A: 3,
    SUMMER_B: 4,
    OTHER: 9,
  },
  S2: {
    S2: 0,
    FULL_YEAR: 0.5,
    SUMMER_A: 1,
    SUMMER_B: 2,
    S1: 3,
    WINTER: 4,
    OTHER: 9,
  },
}

/** Position of a period within a study year that starts at `start`. */
export function periodRank(kind: PeriodKind, start: StartPeriod): number {
  return RANK[start][kind]
}

/** Slots in chronological order for the intake. Stable for equal ranks. */
export function sortSlots<T extends Pick<PlannerSlot, "kind">>(
  slots: readonly T[],
  start: StartPeriod
): T[] {
  return slots
    .map((s, i) => ({ s, i }))
    .sort(
      (a, b) =>
        periodRank(a.s.kind, start) - periodRank(b.s.kind, start) || a.i - b.i
    )
    .map(({ s }) => s)
}

/** The two semesters of a study year, in order. */
export function primaryOrder(start: StartPeriod): ["S1", "S2"] | ["S2", "S1"] {
  return start === "S2" ? ["S2", "S1"] : ["S1", "S2"]
}

/**
 * Calendar year a period of study year `yearIndex` falls in. Summer
 * runs in January–February, so the summer after S2 belongs to the next
 * calendar year; for a mid-year start, everything after S2 does.
 */
export function slotCalendarYear(
  state: Pick<PlannerState, "courseYear" | "startPeriod">,
  yearIndex: number,
  kind: PeriodKind
): number {
  const base = startYearOf(state) + yearIndex
  if (startPeriodOf(state) === "S1") {
    return kind === "SUMMER_A" || kind === "SUMMER_B" ? base + 1 : base
  }
  return kind === "S2" || kind === "FULL_YEAR" || kind === "OTHER"
    ? base
    : base + 1
}

/** "2027" for a Semester 1 start, "2027–28" for a mid-year start. */
export function studyYearSpan(
  state: Pick<PlannerState, "courseYear" | "startPeriod">,
  yearIndex: number
): string {
  const first = startYearOf(state) + yearIndex
  if (startPeriodOf(state) === "S1") return String(first)
  return `${first}-${String(first + 1).slice(-2)}`
}

/** "Semester 2, 2027", or the slot's own label when the student set one. */
export function slotLabel(
  state: Pick<PlannerState, "courseYear" | "startPeriod">,
  yearIndex: number,
  slot: Pick<PlannerSlot, "kind" | "label">
): string {
  return (
    slot.label ??
    `${PERIOD_KIND_LABEL[slot.kind]}, ${slotCalendarYear(state, yearIndex, slot.kind)}`
  )
}

/** "Semester 2, 2027" for the intake itself. */
export function startLabel(
  state: Pick<PlannerState, "courseYear" | "startPeriod">
): string {
  return `${PERIOD_KIND_LABEL[startPeriodOf(state)]}, ${startYearOf(state)}`
}

/** Credit points a slot contributes without units (exchange blocks). */
export function slotBlockCredit(
  slot: Pick<PlannerSlot, "status" | "creditPoints">
): number {
  return slot.status === "exchange" ? (slot.creditPoints ?? 24) : 0
}

/**
 * The next `n` semesters after the end of the plan, as (yearIndex,
 * kind) positions: the last year's missing semester first, then whole
 * new study years. Used to project a finish date and to add the
 * semesters a plan still needs.
 */
export function nextSemesters(
  state: Pick<PlannerState, "startPeriod" | "years">,
  n: number
): Array<{ yearIndex: number; kind: "S1" | "S2" }> {
  const [first, second] = primaryOrder(startPeriodOf(state))
  const out: Array<{ yearIndex: number; kind: "S1" | "S2" }> = []
  let yearIndex = state.years.length - 1
  const last = state.years[yearIndex]
  let nextKind: "S1" | "S2" =
    last &&
    last.slots.some((s) => s.kind === first) &&
    !last.slots.some((s) => s.kind === second)
      ? second
      : first
  if (nextKind === first) yearIndex += 1
  while (out.length < n) {
    out.push({ yearIndex, kind: nextKind })
    if (nextKind === first) nextKind = second
    else {
      nextKind = first
      yearIndex += 1
    }
  }
  return out
}

const ORDINALS = [
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
  "Tenth",
]

/**
 * How students name a study year: "First year", "Second year"… from
 * its position, so it stays right when years are added or removed.
 * Past the tenth it falls back to "Year 11".
 */
export function studyYearName(yearIndex: number): string {
  const word = ORDINALS[yearIndex]
  return word ? `${word} year` : `Year ${yearIndex + 1}`
}
