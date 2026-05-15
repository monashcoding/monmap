import type { PeriodKind } from "@/lib/planner/types"

/**
 * Static lookup tables used by the unit-search panel. Lifted out of the
 * component so the panel reads as orchestration; new options only require
 * a tweak here.
 */

export const LEVEL_OPTIONS = [1, 2, 3, 4] as const
export const CP_OPTIONS = [6, 12, 18, 24] as const
export const PERIOD_OPTIONS: PeriodKind[] = [
  "S1",
  "S2",
  "FULL_YEAR",
  "SUMMER_A",
  "WINTER",
]
export const CAMPUS_OPTIONS = ["Clayton", "Caulfield", "Malaysia"] as const
export const MODE_OPTIONS = [
  { code: "ON-CAMPUS", label: "On-campus" },
  { code: "ONLINE", label: "Online" },
] as const

export const SORT_OPTIONS = [
  { key: "relevance", label: "Relevance", short: "Relevance" },
  { key: "level-asc", label: "Level (low → high)", short: "Level ↑" },
  { key: "level-desc", label: "Level (high → low)", short: "Level ↓" },
  { key: "credit", label: "Credit points (low → high)", short: "Credits ↑" },
  { key: "code", label: "Unit code (A → Z)", short: "Code A–Z" },
] as const

export type SortKey = (typeof SORT_OPTIONS)[number]["key"]

export const CHIP_BASE =
  "flex items-center justify-center rounded-lg text-xs font-medium transition-all border"
export const CHIP_ACTIVE =
  "border-primary bg-primary text-primary-foreground shadow-sm"
export const CHIP_IDLE =
  "border-transparent bg-muted text-foreground hover:border-primary/60 hover:bg-primary/40"

/** Extract the numeric level from a level string like "Level 2". */
export function extractLevelNum(level: string | null): number | null {
  if (!level) return null
  const m = level.match(/\d+/)
  return m ? Number(m[0]) : null
}

/** Immutable Set toggle. */
export function toggleInSet<T>(set: Set<T>, val: T): Set<T> {
  const next = new Set(set)
  if (next.has(val)) next.delete(val)
  else next.add(val)
  return next
}
