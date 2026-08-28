import type { RequirementGroup } from "./types.ts"

/**
 * Options in `group` the student can still take, given what's already
 * on their plan and the course's prohibition edges.
 *
 * An option is unreachable when the plan already holds a unit that
 * prohibits it. The blocking unit may be compulsory somewhere else in
 * the degree — L3005's law half requires LAW2102, and BTC1110 (one of
 * the seven commerce Part A cores) prohibits it — or it may simply be
 * the other half of a pick-one pair the student has already resolved
 * (ACC1100 rules out ACC1001).
 *
 * An option already on the plan is always reachable: it's done.
 */
export function reachableOptions(
  group: RequirementGroup,
  plannedCodes: ReadonlySet<string>,
  conflicts: Readonly<Record<string, string[]>> | undefined
): string[] {
  if (!conflicts) return [...group.options]
  return group.options.filter((code) => {
    if (plannedCodes.has(code)) return true
    const blockers = conflicts[code]
    return !blockers?.some((b) => plannedCodes.has(b))
  })
}

/**
 * How many options of this group the student must complete, capped at
 * how many they can still reach.
 *
 * Without the cap a group can demand more than the degree permits and
 * the plan never reads 100% — two students reported exactly that on
 * Laws/Commerce ("I can't get 100% completed course since I only have
 * to do one, but I can't enter both in as Monplan suggests I should").
 * The cap only ever lowers the target, and only in response to units
 * the student has actually placed, so an untouched plan is unchanged.
 */
export function effectiveRequired(
  group: RequirementGroup,
  plannedCodes: ReadonlySet<string>,
  conflicts: Readonly<Record<string, string[]>> | undefined
): number {
  const reachable = reachableOptions(group, plannedCodes, conflicts).length
  return Math.max(0, Math.min(group.required, reachable))
}
