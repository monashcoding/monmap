import type { PeriodKind, PlannerOffering, PlannerUnit } from "./types.ts"
import { unitLevel } from "./unit-level.ts"

/** The unit search panel's filters; an empty set means "any". */
export interface FiltersValue {
  level: Set<number>
  cp: Set<number>
  period: Set<PeriodKind>
  campus: Set<string>
  mode: Set<string>
}

export type SortKey =
  "relevance" | "level-asc" | "level-desc" | "credit" | "code"

export function emptyFilters(): FiltersValue {
  return {
    level: new Set(),
    cp: new Set(),
    period: new Set(),
    campus: new Set(),
    mode: new Set(),
  }
}

/**
 * Filter and sort search results. A unit whose offerings haven't
 * loaded passes the period, campus and mode filters, so a result
 * doesn't vanish while its data is on the way. "relevance" keeps the
 * server's order.
 */
export function applyFiltersAndSort(
  input: readonly PlannerUnit[],
  filters: FiltersValue,
  sortBy: SortKey,
  offerings: ReadonlyMap<
    string,
    readonly Pick<
      PlannerOffering,
      "periodKind" | "location" | "attendanceModeCode"
    >[]
  >
): PlannerUnit[] {
  let list = [...input]

  if (filters.level.size > 0) {
    list = list.filter((u) => {
      const n = unitLevel(u.level)
      return n !== null && filters.level.has(n)
    })
  }

  if (filters.cp.size > 0) {
    list = list.filter((u) => filters.cp.has(u.creditPoints))
  }

  if (
    filters.period.size > 0 ||
    filters.campus.size > 0 ||
    filters.mode.size > 0
  ) {
    list = list.filter((u) => {
      const offs = offerings.get(u.code)
      if (!offs || offs.length === 0) return true
      return offs.some((o) => {
        if (filters.period.size > 0 && !filters.period.has(o.periodKind))
          return false
        if (filters.campus.size > 0 && !filters.campus.has(o.location ?? ""))
          return false
        if (
          filters.mode.size > 0 &&
          !filters.mode.has(o.attendanceModeCode ?? "")
        )
          return false
        return true
      })
    })
  }

  if (sortBy === "level-asc") {
    list.sort((a, b) => (unitLevel(a.level) ?? 99) - (unitLevel(b.level) ?? 99))
  } else if (sortBy === "level-desc") {
    list.sort((a, b) => (unitLevel(b.level) ?? -1) - (unitLevel(a.level) ?? -1))
  } else if (sortBy === "credit") {
    list.sort((a, b) => a.creditPoints - b.creditPoints)
  } else if (sortBy === "code") {
    list.sort((a, b) => a.code.localeCompare(b.code))
  }

  return list
}
