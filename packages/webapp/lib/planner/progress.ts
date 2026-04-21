import type {
  PlannerAreaOfStudy,
  PlannerCourseWithAoS,
  PlannerState,
  PlannerUnit,
} from "./types.ts";

export interface ProgressSummary {
  /** Credit points across all slots, counting only units present in unitsByCode. */
  totalCreditPoints: number;
  /** Credit points the course requires for completion. */
  targetCreditPoints: number;
  creditPointsByYear: number[];
  creditPointsBySlotKind: { S1: number; S2: number; OTHER: number };
  uniqueUnitCount: number;
  duplicateUnitCodes: string[];
}

export function summarizePlan(
  state: PlannerState,
  course: PlannerCourseWithAoS | null,
  unitsByCode: ReadonlyMap<string, PlannerUnit>,
): ProgressSummary {
  let total = 0;
  const byYear: number[] = [];
  const byKind = { S1: 0, S2: 0, OTHER: 0 };
  const seen = new Map<string, number>();

  for (const year of state.years) {
    let yearTotal = 0;
    for (const slot of year.slots) {
      for (const code of slot.unitCodes) {
        const cp = unitsByCode.get(code)?.creditPoints ?? 0;
        total += cp;
        yearTotal += cp;
        if (slot.kind === "S1" || slot.kind === "S2") byKind[slot.kind] += cp;
        else byKind.OTHER += cp;
        seen.set(code, (seen.get(code) ?? 0) + 1);
      }
    }
    byYear.push(yearTotal);
  }

  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([c]) => c).sort();

  return {
    totalCreditPoints: total,
    targetCreditPoints: course?.creditPoints ?? 144,
    creditPointsByYear: byYear,
    creditPointsBySlotKind: byKind,
    uniqueUnitCount: seen.size,
    duplicateUnitCodes: duplicates,
  };
}

export interface AoSProgress {
  aos: PlannerAreaOfStudy;
  /** Required codes the student has placed somewhere in the plan. */
  completedCodes: string[];
  /** Required codes the student hasn't placed. Sorted by grouping then code. */
  remainingCodes: { code: string; grouping: string }[];
  /** Credit points the student has placed that are members of this AoS. */
  plannedCreditPoints: number;
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
  unitsByCode: ReadonlyMap<string, PlannerUnit>,
): AoSProgress {
  const completedCodes: string[] = [];
  const remaining: { code: string; grouping: string }[] = [];
  let plannedCp = 0;

  for (const unit of aos.units) {
    if (plannedCodes.has(unit.code)) {
      completedCodes.push(unit.code);
      plannedCp += unitsByCode.get(unit.code)?.creditPoints ?? 0;
    } else {
      remaining.push(unit);
    }
  }

  remaining.sort((a, b) =>
    a.grouping === b.grouping ? a.code.localeCompare(b.code) : a.grouping.localeCompare(b.grouping),
  );

  return {
    aos,
    completedCodes: completedCodes.sort(),
    remainingCodes: remaining,
    plannedCreditPoints: plannedCp,
  };
}

/** All codes placed anywhere in the plan. */
export function plannedUnitCodes(state: PlannerState): Set<string> {
  const s = new Set<string>();
  for (const y of state.years) for (const sl of y.slots) for (const c of sl.unitCodes) s.add(c);
  return s;
}
