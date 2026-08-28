import type { PlannerCreditEntry, PlannerState } from "./types.ts"

/**
 * Advanced standing — study the student already holds credit for.
 *
 * Credit is deliberately *not* modelled as a year of slots. A credited
 * unit has no teaching period, no campus and no offering, so putting it
 * in a slot means inventing all three and then suppressing the
 * validation they'd trigger. Students were doing exactly that by hand
 * ("the unit exemptions are hard to simulate in the plan without adding
 * another 'fake year' with exempted units") and hitting the errors this
 * module exists to prevent.
 */

/** Codes the student is credited with. Block credit has no code. */
export function creditedCodes(state: PlannerState): Set<string> {
  const out = new Set<string>()
  for (const c of state.credit ?? []) if (c.code) out.add(c.code)
  return out
}

/**
 * Credit points from advanced standing, toward the degree total.
 *
 * `alsoPlaced` names codes already counted from the plan's slots, so a
 * unit that is somehow both credited and placed is counted once.
 */
export function creditPointsFromCredit(
  state: PlannerState,
  alsoPlaced?: ReadonlySet<string>
): number {
  let total = 0
  const seen = new Set<string>()
  for (const c of state.credit ?? []) {
    if (c.code) {
      if (seen.has(c.code) || alsoPlaced?.has(c.code)) continue
      seen.add(c.code)
    }
    total += Number.isFinite(c.creditPoints) ? c.creditPoints : 0
  }
  return total
}

/** Human label for one entry, for the credit list and its remove button. */
export function creditEntryLabel(entry: PlannerCreditEntry): string {
  if (entry.code) return entry.code
  return entry.label?.trim() || `${entry.creditPoints}cp credit`
}
