"use client"

import { SearchIcon, XIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { searchUnitsAction } from "@/app/actions"
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period"
import type { PeriodKind, PlannerUnit } from "@/lib/planner/types"

import { DraggableUnitRow } from "./draggable-unit-row"
import { usePlanner } from "./planner-context"
import {
  ActiveFilterChips,
  type ActiveChip,
} from "./unit-search/active-filter-chips"
import {
  extractLevelNum,
  MODE_OPTIONS,
  toggleInSet,
  type SortKey,
} from "./unit-search/config"
import {
  FiltersPopover,
  type FiltersValue,
} from "./unit-search/filters-popover"
import { EmptyResultState, ResultSection } from "./unit-search/result-section"
import { SortPopover } from "./unit-search/sort-popover"

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

/**
 * Sidebar (and mobile bottom-sheet) panel for searching, filtering and
 * sorting unit results, plus the always-visible "Suggested from your
 * course" list. Filter/sort UIs and the result section wrappers each
 * live in their own files under `./unit-search/` for clarity.
 */
export function UnitSearchPanel() {
  const { state, course, units, offerings, availableYears, mergeUnits } =
    usePlanner()

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PlannerUnit[]>([])
  const [loading, setLoading] = useState(false)

  const [filters, setFilters] = useState<FiltersValue>(() => ({
    level: new Set<number>(),
    cp: new Set<number>(),
    period: new Set<PeriodKind>(),
    campus: new Set<string>(),
    mode: new Set<string>(),
  }))
  const [sortBy, setSortBy] = useState<SortKey>("relevance")
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)

  const debounced = useDebounced(query, 180)

  const handbookYear = useMemo(() => {
    const target = state.courseYear
    if (availableYears.includes(target)) return target
    return [...availableYears].sort().at(-1) ?? state.courseYear
  }, [state.courseYear, availableYears])

  const suggestions = useMemo<PlannerUnit[]>(() => {
    if (!course) return []
    const placed = new Set<string>()
    for (const y of state.years)
      for (const s of y.slots) for (const c of s.unitCodes) placed.add(c)
    const seen = new Set<string>()
    const out: PlannerUnit[] = []
    for (const aos of course.areasOfStudy) {
      for (const u of aos.units) {
        if (placed.has(u.code) || seen.has(u.code)) continue
        seen.add(u.code)
        const full = units.get(u.code)
        if (full) out.push(full)
        if (out.length >= 8) break
      }
      if (out.length >= 8) break
    }
    return out
  }, [course, state.years, units])

  useEffect(() => {
    let cancelled = false
    if (!debounced.trim()) return
    const t = setTimeout(() => setLoading(true), 0)
    searchUnitsAction(debounced, handbookYear)
      .then((list) => {
        if (cancelled) return
        setResults(list)
        setLoading(false)
        mergeUnits(list)
      })
      .catch(() => {
        if (cancelled) return
        setResults([])
        setLoading(false)
      })
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [debounced, mergeUnits, handbookYear])

  const hasQuery = !!debounced.trim()
  const hasActiveFilters =
    filters.level.size > 0 ||
    filters.cp.size > 0 ||
    filters.period.size > 0 ||
    filters.campus.size > 0 ||
    filters.mode.size > 0

  const searchItems = useMemo(
    () => applyFiltersAndSort(results, filters, sortBy, offerings),
    [results, filters, sortBy, offerings]
  )

  function clearFilters() {
    setFilters({
      level: new Set(),
      cp: new Set(),
      period: new Set(),
      campus: new Set(),
      mode: new Set(),
    })
  }

  const activeChips: ActiveChip[] = []
  for (const lvl of filters.level) {
    activeChips.push({
      key: `lvl-${lvl}`,
      label: `Level ${lvl}`,
      remove: () =>
        setFilters((f) => ({ ...f, level: toggleInSet(f.level, lvl) })),
    })
  }
  for (const cp of filters.cp) {
    activeChips.push({
      key: `cp-${cp}`,
      label: `${cp}cp`,
      remove: () => setFilters((f) => ({ ...f, cp: toggleInSet(f.cp, cp) })),
    })
  }
  for (const p of filters.period) {
    activeChips.push({
      key: `p-${p}`,
      label: PERIOD_KIND_LABEL[p],
      remove: () =>
        setFilters((f) => ({ ...f, period: toggleInSet(f.period, p) })),
    })
  }
  for (const c of filters.campus) {
    activeChips.push({
      key: `c-${c}`,
      label: c,
      remove: () =>
        setFilters((f) => ({ ...f, campus: toggleInSet(f.campus, c) })),
    })
  }
  for (const m of filters.mode) {
    const opt = MODE_OPTIONS.find((o) => o.code === m)
    activeChips.push({
      key: `m-${m}`,
      label: opt?.label ?? m,
      remove: () => setFilters((f) => ({ ...f, mode: toggleInSet(f.mode, m) })),
    })
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2">
        <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          placeholder="Search units…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <FiltersPopover
          open={filterOpen}
          onOpenChange={setFilterOpen}
          value={filters}
          onLevelChange={(level) => setFilters((f) => ({ ...f, level }))}
          onCpChange={(cp) => setFilters((f) => ({ ...f, cp }))}
          onPeriodChange={(period) => setFilters((f) => ({ ...f, period }))}
          onCampusChange={(campus) => setFilters((f) => ({ ...f, campus }))}
          onModeChange={(mode) => setFilters((f) => ({ ...f, mode }))}
          onClear={clearFilters}
        />
        <SortPopover
          open={sortOpen}
          onOpenChange={setSortOpen}
          value={sortBy}
          onChange={setSortBy}
        />
      </div>

      <ActiveFilterChips chips={activeChips} onClearAll={clearFilters} />

      {hasQuery && (
        <ResultSection
          title="Search results"
          count={loading ? null : searchItems.length}
        >
          {loading ? (
            <EmptyResultState message="Searching…" />
          ) : searchItems.length === 0 ? (
            results.length === 0 ? (
              <EmptyResultState message={`No matches for "${debounced}"`} />
            ) : (
              <EmptyResultState
                message="No results match your filters"
                action={
                  hasActiveFilters
                    ? { label: "Clear filters", onClick: clearFilters }
                    : undefined
                }
              />
            )
          ) : (
            searchItems.map((u) => (
              <DraggableUnitRow key={u.code} code={u.code} />
            ))
          )}
        </ResultSection>
      )}

      <div className="-mx-3 border-t px-3 pt-3">
        <ResultSection
          title="Suggested from your course"
          count={suggestions.length}
          collapsible
        >
          {suggestions.length === 0 ? (
            <EmptyResultState
              message={
                course
                  ? "All your course units are already placed"
                  : "Pick a course to see suggestions"
              }
            />
          ) : (
            suggestions.map((u) => (
              <DraggableUnitRow key={u.code} code={u.code} />
            ))
          )}
        </ResultSection>
      </div>
    </div>
  )
}

/**
 * Pure filter+sort transformation applied to the raw API results. Kept
 * out of the component so it's easy to unit-test (and easy to read).
 */
function applyFiltersAndSort(
  input: PlannerUnit[],
  filters: FiltersValue,
  sortBy: SortKey,
  offerings: ReadonlyMap<
    string,
    {
      periodKind: PeriodKind
      location: string | null
      attendanceModeCode: string | null
    }[]
  >
): PlannerUnit[] {
  let list = [...input]

  if (filters.level.size > 0) {
    list = list.filter((u) => {
      const n = extractLevelNum(u.level)
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
    list.sort((a, b) => {
      const la = extractLevelNum(a.level) ?? 99
      const lb = extractLevelNum(b.level) ?? 99
      return la - lb
    })
  } else if (sortBy === "level-desc") {
    list.sort((a, b) => {
      const la = extractLevelNum(a.level) ?? -1
      const lb = extractLevelNum(b.level) ?? -1
      return lb - la
    })
  } else if (sortBy === "credit") {
    list.sort((a, b) => a.creditPoints - b.creditPoints)
  } else if (sortBy === "code") {
    list.sort((a, b) => a.code.localeCompare(b.code))
  }

  return list
}
