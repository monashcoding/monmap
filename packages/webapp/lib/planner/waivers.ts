import { placedUnitCodes } from "./progress.ts"
import { referencedCodes } from "./requisites.ts"
import type {
  PlannerPrerequisiteWaiver,
  PlannerState,
  RequisiteBlock,
  SlotUnitValidation,
} from "./types.ts"

/** Waived prerequisite codes, by the unit they're waived for. */
export function waiversByUnit(
  state: Pick<PlannerState, "waivers">
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()

  for (const { unitCode, prerequisiteCode } of state.waivers ?? []) {
    const codes = out.get(unitCode) ?? new Set<string>()
    codes.add(prerequisiteCode)
    out.set(unitCode, codes)
  }

  return out
}

/** What a unit's prerequisites read as met: never its other requisites. */
export function withWaived(
  completed: ReadonlySet<string>,
  waived: ReadonlySet<string> | undefined
): ReadonlySet<string> {
  return waived ? new Set([...completed, ...waived]) : completed
}

/**
 * What a unit's details can do with waivers. Editing needs a slot whose
 * validation reads the tree on screen. A slot can read another year (a
 * full-year unit's other half, or a unit gone from that year's handbook),
 * so there it only shows them, and a browsed year's tree isn't the plan's
 * at all.
 */
export function waiverAccess(view: {
  isPlaced: boolean
  usingCurrentYear: boolean
  selectedYear: string
  defaultYear: string
}): "edit" | "read" | "none" {
  if (view.isPlaced && view.usingCurrentYear) return "edit"

  return view.usingCurrentYear || view.selectedYear === view.defaultYear
    ? "read"
    : "none"
}

/** The codes a placed unit's unmet prerequisites offer to waive. */
export function waivableCodes(
  validation: Pick<SlotUnitValidation, "errors"> | undefined
): Set<string> {
  return new Set(
    validation?.errors
      .filter((e) => e.kind === "prereq_unmet")
      .flatMap((e) => e.relatedCodes ?? [])
      // A leaf with no code (see slimLeaf) has nothing to name.
      .filter(Boolean)
  )
}

/** Waivers for units still placed, the ones worth printing or exporting. */
export function placedWaivers(
  state: Pick<PlannerState, "waivers" | "years">
): PlannerPrerequisiteWaiver[] {
  const placed = placedUnitCodes(state)

  return (state.waivers ?? []).filter((w) => placed.has(w.unitCode))
}

/** Why a waiver isn't doing anything right now, or null when it might be. */
export function waiverNote(
  waiver: PlannerPrerequisiteWaiver,
  placed: ReadonlySet<string>,
  requisites: ReadonlyMap<string, readonly RequisiteBlock[]>
): string | null {
  if (!placed.has(waiver.unitCode)) return "This unit isn't on your plan."

  const blocks = requisites.get(waiver.unitCode)

  if (!blocks) return null

  const named = blocks.some(
    (b) =>
      b.requisiteType === "prerequisite" &&
      referencedCodes(b.rule).has(waiver.prerequisiteCode)
  )

  return named ? null : "No longer one of this unit's prerequisites."
}
