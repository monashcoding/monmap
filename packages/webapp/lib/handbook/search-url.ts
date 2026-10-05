/**
 * The /search page's state lives in its query string so every search
 * is a link: ?q=&type=&year=&faculty=&study=&level=&period=&campus=&page=.
 * Defaults are left out to keep URLs short.
 */

import { MAX_QUERY_LENGTH } from "../db/input.ts"
import { PERIOD_KIND_ORDER } from "../planner/teaching-period.ts"
import type { PeriodKind } from "../planner/types.ts"

export type SearchTab = "all" | "courses" | "aos" | "units"
export type StudyLevel =
  "Undergraduate" | "Honours" | "Postgraduate" | "Research"

export const SEARCH_TABS: SearchTab[] = ["all", "courses", "aos", "units"]
export const STUDY_LEVELS: StudyLevel[] = [
  "Undergraduate",
  "Honours",
  "Postgraduate",
  "Research",
]

export interface SearchState {
  q: string
  tab: SearchTab
  /** Null means the latest handbook year. */
  year: string | null
  faculty: string | null
  study: StudyLevel | null
  /** Unit-only filters. */
  level: string | null
  period: PeriodKind | null
  campus: string | null
  page: number
}

type Raw = Record<string, string | string[] | undefined>

/** A query param's first value, trimmed; null when empty or missing. */
export function firstParam(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v
  return s && s.trim() ? s.trim() : null
}

/** First value, cut to MAX_QUERY_LENGTH: no real query or name is longer. */
const text = (v: string | string[] | undefined) =>
  firstParam(v)?.slice(0, MAX_QUERY_LENGTH) ?? null

export function parseSearchState(
  sp: Raw,
  years: readonly string[]
): SearchState {
  const tab = firstParam(sp.type) as SearchTab | null
  const study = firstParam(sp.study) as StudyLevel | null
  const period = firstParam(sp.period) as PeriodKind | null
  const level = firstParam(sp.level)
  const year = firstParam(sp.year)
  const page = Number(firstParam(sp.page) ?? 1)
  const resolvedTab = tab && SEARCH_TABS.includes(tab) ? tab : "all"
  const units = resolvedTab === "units"
  return {
    q: text(sp.q) ?? "",
    tab: resolvedTab,
    year: year && years.includes(year) && year !== years.at(-1) ? year : null,
    faculty: text(sp.faculty),
    study: study && STUDY_LEVELS.includes(study) ? study : null,
    level: units && level && /^\d$/.test(level) ? level : null,
    period:
      units && period && PERIOD_KIND_ORDER.includes(period) ? period : null,
    campus: units ? text(sp.campus) : null,
    page: Number.isInteger(page) && page > 1 ? Math.min(page, 500) : 1,
  }
}

export function searchParamsOf(s: SearchState): URLSearchParams {
  const sp = new URLSearchParams()
  if (s.q) sp.set("q", s.q)
  if (s.tab !== "all") sp.set("type", s.tab)
  if (s.year) sp.set("year", s.year)
  if (s.faculty) sp.set("faculty", s.faculty)
  if (s.study) sp.set("study", s.study)
  if (s.level) sp.set("level", s.level)
  if (s.period) sp.set("period", s.period)
  if (s.campus) sp.set("campus", s.campus)
  if (s.page > 1) sp.set("page", String(s.page))
  return sp
}

/**
 * The URL for `s` with `change` applied. Any change other than the
 * page goes back to page 1, and leaving the Units tab drops the
 * unit-only filters.
 */
export function searchHref(
  s: SearchState,
  change: Partial<SearchState> = {}
): string {
  const next: SearchState = { ...s, page: 1, ...change }
  if (next.tab !== "units") {
    next.level = null
    next.period = null
    next.campus = null
  }
  const qs = searchParamsOf(next).toString()
  return qs ? `/search?${qs}` : "/search"
}
