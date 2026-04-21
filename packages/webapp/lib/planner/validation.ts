import { evaluateProhibition, evaluateRequisiteTree } from "./requisites.ts";
import type {
  PeriodKind,
  PlannerOffering,
  PlannerState,
  PlannerUnit,
  RequisiteBlock,
  SlotUnitValidation,
  ValidationIssue,
} from "./types.ts";

const MAX_CREDIT_LOAD_PER_SLOT = 24;

/**
 * Per-unit-in-slot validation. Returns hard errors (red) and soft
 * warnings (amber).
 *
 * Chronology model: a unit placed in slot (yearIndex, period) has
 *   completed   = every unit in earlier years + earlier periods of the
 *                 same year
 *   concurrent  = every other unit in the same slot
 * Prereqs are satisfied iff their rule is met by `completed`.
 * Coreqs are satisfied iff their rule is met by `completed ∪ concurrent`.
 * Prohibitions trip iff any referenced unit appears in the student's
 *   entire plan (past, present, future) — enrolling in any of them
 *   ever blocks you, symmetric.
 *
 * Offerings: the unit must have at least one offering with the same
 * period-kind as the slot. We don't check location here — students
 * move between campuses, the UI shows availability as a hint only.
 */
export interface ValidationInput {
  unit: PlannerUnit;
  slotKind: PeriodKind;
  yearIndex: number;
  slotIndex: number;
  completedBefore: ReadonlySet<string>;
  concurrentWith: ReadonlySet<string>;
  allPlannedCodes: ReadonlySet<string>;
  offerings: PlannerOffering[];
  requisites: RequisiteBlock[];
  slotCreditLoad: number;
}

export function validateUnitInSlot(input: ValidationInput): SlotUnitValidation {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!isOfferedInPeriod(input.offerings, input.slotKind)) {
    errors.push({
      kind: "not_offered_in_period",
      message: `${input.unit.code} isn't offered in ${periodLabel(input.slotKind)} for ${input.unit.year}.`,
    });
  }

  const prereqs = input.requisites.filter((r) => r.requisiteType === "prerequisite");
  for (const block of prereqs) {
    const res = evaluateRequisiteTree(block.rule, input.completedBefore);
    if (!res.satisfied) {
      errors.push({
        kind: "prereq_unmet",
        message: `Prerequisite not satisfied: need ${formatCodeList(res.missingCodes)} before ${input.unit.code}.`,
        relatedCodes: res.missingCodes,
      });
    }
  }

  const coreqs = input.requisites.filter((r) => r.requisiteType === "corequisite");
  for (const block of coreqs) {
    const combined = new Set<string>([
      ...input.completedBefore,
      ...input.concurrentWith,
    ]);
    const res = evaluateRequisiteTree(block.rule, combined);
    if (!res.satisfied) {
      errors.push({
        kind: "coreq_unmet",
        message: `Corequisite not satisfied: need ${formatCodeList(res.missingCodes)} by the end of this slot.`,
        relatedCodes: res.missingCodes,
      });
    }
  }

  const prohibitions = input.requisites.filter((r) => r.requisiteType === "prohibition");
  for (const block of prohibitions) {
    const res = evaluateProhibition(block.rule, input.allPlannedCodes);
    if (!res.satisfied) {
      errors.push({
        kind: "prohibition_conflict",
        message: `Can't take with ${formatCodeList(res.conflictingCodes)}.`,
        relatedCodes: res.conflictingCodes,
      });
    }
  }

  if (input.slotCreditLoad > MAX_CREDIT_LOAD_PER_SLOT) {
    warnings.push({
      kind: "over_credit_load",
      message: `Slot has ${input.slotCreditLoad} credit points — the standard full-time load is ${MAX_CREDIT_LOAD_PER_SLOT}.`,
    });
  }

  return { code: input.unit.code, errors, warnings };
}

export function isOfferedInPeriod(
  offerings: PlannerOffering[],
  period: PeriodKind,
): boolean {
  return offerings.some((o) => o.periodKind === period);
}

export function periodLabel(period: PeriodKind): string {
  switch (period) {
    case "S1": return "Semester 1";
    case "S2": return "Semester 2";
    case "SUMMER_A": return "Summer A";
    case "SUMMER_B": return "Summer B";
    case "WINTER": return "Winter";
    case "FULL_YEAR": return "Full year";
    case "OTHER": return "Other";
  }
}

function formatCodeList(codes: string[]): string {
  if (codes.length === 0) return "(no data)";
  if (codes.length === 1) return codes[0];
  if (codes.length === 2) return `${codes[0]} or ${codes[1]}`;
  return `${codes.slice(0, -1).join(", ")} or ${codes.at(-1)}`;
}

/**
 * Walk the whole plan once and return per-slot-per-unit validation.
 * Keyed by `${yearIndex}:${slotIndex}:${code}`.
 */
export function validatePlan(
  state: PlannerState,
  unitsByCode: ReadonlyMap<string, PlannerUnit>,
  offeringsByCode: ReadonlyMap<string, PlannerOffering[]>,
  requisitesByCode: ReadonlyMap<string, RequisiteBlock[]>,
): Map<string, SlotUnitValidation> {
  const out = new Map<string, SlotUnitValidation>();

  const allPlanned = new Set<string>();
  for (const yr of state.years) for (const s of yr.slots) for (const c of s.unitCodes) allPlanned.add(c);

  const completed = new Set<string>();

  for (let y = 0; y < state.years.length; y++) {
    const year = state.years[y];
    for (let s = 0; s < year.slots.length; s++) {
      const slot = year.slots[s];
      const concurrent = new Set(slot.unitCodes);

      const slotCreditLoad = slot.unitCodes.reduce(
        (sum, c) => sum + (unitsByCode.get(c)?.creditPoints ?? 0),
        0,
      );

      for (const code of slot.unitCodes) {
        const unit = unitsByCode.get(code);
        if (!unit) {
          out.set(keyFor(y, s, code), {
            code,
            errors: [
              {
                kind: "unknown_unit",
                message: `Unit ${code} not found in this handbook year.`,
              },
            ],
            warnings: [],
          });
          continue;
        }

        const concurrentWithoutSelf = new Set(concurrent);
        concurrentWithoutSelf.delete(code);

        const v = validateUnitInSlot({
          unit,
          slotKind: slot.kind,
          yearIndex: y,
          slotIndex: s,
          completedBefore: completed,
          concurrentWith: concurrentWithoutSelf,
          allPlannedCodes: new Set([...allPlanned].filter((c) => c !== code)),
          offerings: offeringsByCode.get(code) ?? [],
          requisites: requisitesByCode.get(code) ?? [],
          slotCreditLoad,
        });
        out.set(keyFor(y, s, code), v);
      }

      for (const c of slot.unitCodes) completed.add(c);
    }
  }

  return out;
}

export function keyFor(yearIndex: number, slotIndex: number, code: string): string {
  return `${yearIndex}:${slotIndex}:${code}`;
}
