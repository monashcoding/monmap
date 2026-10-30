import { PERIOD_KIND_LABEL } from "./teaching-period.ts"
import { IT_2027 } from "./transitions-it-2027.ts"
import type { PeriodKind } from "./types.ts"

// Course changes the handbook can't express, copied by hand from faculty
// pages. The slot year's own handbook still wins (see offeringIssue).

export interface TransitionTerm {
  year: number
  /** Omitted when the page names only the year ("from 2028"). */
  period?: "S1" | "S2" | "FULL_YEAR"
}

export interface UnitTransition {
  code: string
  /** The page's course or major column. */
  appliesTo?: string
  /** The page's teach-out advice, shown to students as written. */
  advice?: string
  /** A unit "no longer offered" from 2027 has `{ year: 2026 }`. */
  lastOffered?: TransitionTerm
  /** Ignored once the handbook lists any offering for the unit. */
  firstOffered?: TransitionTerm
  /** "from 2028 (S1 and S2)". Ignored like `firstOffered`. */
  periods?: readonly PeriodKind[]
  /** Ways to replace the unit: `[["A", "B"]]` is both, `[["A"], ["B"]]` either. */
  replacedBy?: readonly (readonly string[])[]
}

export interface TransitionSource {
  /** As messages name the publisher: "Faculty of IT". */
  name: string
  /** When the page was copied, as an ISO date. */
  retrieved: string
  units: readonly UnitTransition[]
}

export interface TransitionEntry {
  unit: UnitTransition
  source: TransitionSource
}

export interface Transitions {
  byCode: ReadonlyMap<string, TransitionEntry>
  countsAs: ReadonlyMap<string, readonly string[]>
}

/**
 * Replacements count for requisites both ways (FIT1008 as FIT2115 and back),
 * except forward for either-or lists and back for part of a multi-unit one.
 */
export function buildTransitions(
  sources: readonly TransitionSource[]
): Transitions {
  const byCode = new Map<string, TransitionEntry>()
  const countsAs = new Map<string, string[]>()

  const add = (from: string, to: string) => {
    const list = countsAs.get(from)

    if (list) list.push(to)
    else countsAs.set(from, [to])
  }

  for (const source of sources) {
    for (const unit of source.units) {
      if (byCode.has(unit.code))
        throw new Error(`${unit.code} has more than one transition entry`)
      byCode.set(unit.code, { unit, source })
      const ways = unit.replacedBy ?? []

      if (ways.length === 1) for (const c of ways[0]) add(unit.code, c)

      for (const way of ways) if (way.length === 1) add(way[0], unit.code)
    }
  }

  return { byCode, countsAs }
}

export const SOURCES: readonly TransitionSource[] = [IT_2027]
export const TRANSITIONS = buildTransitions(SOURCES)

// [start, end] within a calendar year; summers are Jan-Feb. OTHER has no
// place, so it never compares.
const SPAN = {
  SUMMER_A: [0, 0],
  SUMMER_B: [0, 0],
  S1: [1, 1],
  WINTER: [2, 2],
  S2: [3, 3],
  FULL_YEAR: [1, 3],
} as const satisfies Record<Exclude<PeriodKind, "OTHER">, readonly number[]>

export function afterLastOffering(
  last: TransitionTerm,
  slotKind: PeriodKind,
  slotYear: number
): boolean {
  if (slotYear !== last.year) return slotYear > last.year

  return (
    !!last.period &&
    slotKind !== "OTHER" &&
    SPAN[slotKind][0] > SPAN[last.period][1]
  )
}

export function beforeFirstOffering(
  first: TransitionTerm,
  slotKind: PeriodKind,
  slotYear: number
): boolean {
  if (slotYear !== first.year) return slotYear < first.year

  return (
    !!first.period &&
    slotKind !== "OTHER" &&
    SPAN[slotKind][1] < SPAN[first.period][0]
  )
}

/** A new unit's stated periods, for while the handbook lists none. */
export function statedPeriods(
  code: string,
  transitions: Transitions = TRANSITIONS
): readonly PeriodKind[] {
  return transitions.byCode.get(code)?.unit.periods ?? []
}

/** "Semester 2, 2027", or "2028" when the page names only the year. */
export function termLabel(term: TransitionTerm): string {
  return term.period
    ? `${PERIOD_KIND_LABEL[term.period]}, ${term.year}`
    : String(term.year)
}

/** "Faculty of IT advice (BCS): Replace with FIT2115.", or null. */
export function adviceSentence(entry: TransitionEntry): string | null {
  const { unit, source } = entry

  if (!unit.advice) return null
  const scope = unit.appliesTo ? ` (${unit.appliesTo})` : ""

  return `${source.name} advice${scope}: ${unit.advice}.`
}
