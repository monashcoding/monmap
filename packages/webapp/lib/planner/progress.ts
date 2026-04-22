import type {
  PlannerAreaOfStudy,
  PlannerCourseWithAoS,
  PlannerState,
  PlannerUnit,
} from "./types.ts"

export interface ProgressSummary {
  /** Credit points across all slots, counting only units present in unitsByCode. */
  totalCreditPoints: number
  /** Credit points the course requires for completion. */
  targetCreditPoints: number
  creditPointsByYear: number[]
  creditPointsBySlotKind: { S1: number; S2: number; OTHER: number }
  uniqueUnitCount: number
  duplicateUnitCodes: string[]
}

export function summarizePlan(
  state: PlannerState,
  course: PlannerCourseWithAoS | null,
  unitsByCode: ReadonlyMap<string, PlannerUnit>
): ProgressSummary {
  let total = 0
  const byYear: number[] = []
  const byKind = { S1: 0, S2: 0, OTHER: 0 }
  const seen = new Map<string, number>()

  for (const year of state.years) {
    let yearTotal = 0
    for (const slot of year.slots) {
      for (const code of slot.unitCodes) {
        const cp = unitsByCode.get(code)?.creditPoints ?? 0
        total += cp
        yearTotal += cp
        if (slot.kind === "S1" || slot.kind === "S2") byKind[slot.kind] += cp
        else byKind.OTHER += cp
        seen.set(code, (seen.get(code) ?? 0) + 1)
      }
    }
    byYear.push(yearTotal)
  }

  const duplicates = [...seen.entries()]
    .filter(([, n]) => n > 1)
    .map(([c]) => c)
    .sort()

  return {
    totalCreditPoints: total,
    targetCreditPoints: course?.creditPoints ?? 144,
    creditPointsByYear: byYear,
    creditPointsBySlotKind: byKind,
    uniqueUnitCount: seen.size,
    duplicateUnitCodes: duplicates,
  }
}

export interface AoSProgress {
  aos: PlannerAreaOfStudy
  /** Codes the student has placed that count toward this AoS (capped per group). */
  completedCodes: string[]
  /** Required codes the student hasn't placed. Sorted by grouping then code. */
  remainingCodes: { code: string; grouping: string }[]
  /** Credit points the student has placed that are members of this AoS. */
  plannedCreditPoints: number
  /**
   * Sum of `required` across every group — the denominator for
   * Requirements panel progress display.
   */
  totalRequired: number
  /**
   * Sum of `min(placedInGroup, requiredInGroup)` across every group —
   * the numerator. A choice group counts as fully satisfied once X
   * options have been placed, even if more are placed.
   */
  satisfiedCount: number
}

/**
 * AoS fulfilment is an approximation — Monash's real requirement trees
 * allow "any 12cp from group X", ranged picks, etc., which we don't
 * decode. We report the flat edge-table hits as a coverage hint:
 * "FIT1045 counts toward your Software Dev major; you've placed 3/8 of
 * its listed units". Useful even if not authoritative.
 */
export function summarizeAoSProgress(
  aos: PlannerAreaOfStudy,
  plannedCodes: ReadonlySet<string>,
  unitsByCode: ReadonlyMap<string, PlannerUnit>
): AoSProgress {
  // Group-wise counting: each grouping contributes
  // `min(placed_in_group, required)` to the satisfied count. Choice
  // groups stop counting after X picks, but every placed option still
  // shows green in the chip list.
  const completedCodes = new Set<string>()
  const remaining: { code: string; grouping: string }[] = []
  let plannedCp = 0
  let satisfied = 0
  let totalRequired = 0
  const cpSeen = new Set<string>()

  for (const group of aos.requirements) {
    totalRequired += group.required
    let placedInGroup = 0
    for (const code of group.options) {
      if (plannedCodes.has(code)) {
        completedCodes.add(code)
        placedInGroup++
        if (!cpSeen.has(code)) {
          cpSeen.add(code)
          plannedCp += unitsByCode.get(code)?.creditPoints ?? 0
        }
      } else if (placedInGroup < group.required) {
        // Surface the first `required` unplaced options as "remaining".
        remaining.push({ code, grouping: group.grouping })
      }
    }
    satisfied += Math.min(placedInGroup, group.required)
  }

  remaining.sort((a, b) =>
    a.grouping === b.grouping
      ? a.code.localeCompare(b.code)
      : a.grouping.localeCompare(b.grouping)
  )

  return {
    aos,
    completedCodes: [...completedCodes].sort(),
    remainingCodes: remaining,
    plannedCreditPoints: plannedCp,
    totalRequired,
    satisfiedCount: satisfied,
  }
}

/** All codes placed anywhere in the plan. */
export function plannedUnitCodes(state: PlannerState): Set<string> {
  const s = new Set<string>()
  for (const y of state.years)
    for (const sl of y.slots) for (const c of sl.unitCodes) s.add(c)
  return s
}
