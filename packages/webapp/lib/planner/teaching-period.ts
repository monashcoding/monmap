import type { PeriodKind } from "./types.ts";

/**
 * Classify Monash's 40+ teaching-period strings into the handful of
 * slots the planner actually models. The prefix-match is deliberate —
 * Monash appends qualifiers like " - alternate", " (extended)",
 * " (Northern)" that are display-only. A student planning an S1 slot
 * cares whether *any* S1 variant is offered, not which flavour.
 *
 * Research quarters / teaching periods 1-6 / Monash Indonesia /
 * trimester streams collapse to OTHER — they don't map cleanly onto
 * the 2-semester grid the UI renders, and rendering every variant
 * would be noise.
 */
export function classifyTeachingPeriod(period: string | null | undefined): PeriodKind {
  if (!period) return "OTHER";
  const p = period.toLowerCase().trim();

  if (p.startsWith("first semester")) return "S1";
  if (p.startsWith("second semester")) return "S2";
  if (p.startsWith("summer semester a")) return "SUMMER_A";
  if (p.startsWith("summer semester b")) return "SUMMER_B";
  if (p.startsWith("winter semester")) return "WINTER";
  if (p.startsWith("full year")) return "FULL_YEAR";

  return "OTHER";
}

export const PERIOD_KIND_LABEL: Record<PeriodKind, string> = {
  S1: "Semester 1",
  S2: "Semester 2",
  SUMMER_A: "Summer A",
  SUMMER_B: "Summer B",
  WINTER: "Winter",
  FULL_YEAR: "Full year",
  OTHER: "Other",
};

export const PERIOD_KIND_SHORT: Record<PeriodKind, string> = {
  S1: "S1",
  S2: "S2",
  SUMMER_A: "SumA",
  SUMMER_B: "SumB",
  WINTER: "Win",
  FULL_YEAR: "Full",
  OTHER: "Other",
};

/**
 * The primary slots a planner year renders by default. S1/S2 cover
 * the bulk of load for a BIT/BCS/etc. student; summer/winter are
 * accessible on demand via the "add summer" affordance.
 */
export const PRIMARY_SLOT_KINDS: PeriodKind[] = ["S1", "S2"];
export const OPTIONAL_SLOT_KINDS: PeriodKind[] = ["SUMMER_A", "SUMMER_B", "WINTER"];
