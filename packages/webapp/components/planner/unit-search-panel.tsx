"use client"

import { SearchIcon, XIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { searchUnitsAction } from "@/app/actions"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { suggestionPool } from "@/lib/planner/personalize-search"
import {
  applyFiltersAndSort,
  emptyFilters,
  type FiltersValue,
} from "@/lib/planner/search-filters"
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period"
import { handbookYearFor } from "@/lib/planner/timeline"
import type { PlannerUnit } from "@/lib/planner/types"
import type { UnitBundle } from "@/lib/planner/unit-cache"

import { DraggableUnitRow } from "./draggable-unit-row"
import { UnitDataOverlay, usePlanner } from "./planner-context"
import {
  ActiveFilterChips,
  type ActiveChip,
} from "./unit-search/active-filter-chips"
import { MODE_OPTIONS, toggleInSet, type SortKey } from "./unit-search/config"
import { FiltersPopover } from "./unit-search/filters-popover"
import { EmptyResultState, ResultSection } from "./unit-search/result-section"
import { SortPopover } from "./unit-search/sort-popover"

const SUGGESTION_LIMIT = 8

/**
 * Sidebar (and mobile bottom-sheet) panel for searching, filtering and
 * sorting unit results, plus the always-visible "Suggested from your
 * course" list. Filter/sort UIs and the result section wrappers each
 * live in their own files under `./unit-search/` for clarity.
 */
export function UnitSearchPanel() {
  const { state, course, units, offerings, availableYears, plannedCodes } =
    usePlanner()

  const [query, setQuery] = useState("")
  // The latest search's results. They stay out of the planner's maps
  // (see UnitDataOverlay); a unit joins them once it is placed.
  const [found, setFound] = useState<{
    query: string
    units: PlannerUnit[]
  } | null>(null)

  const [filters, setFilters] = useState<FiltersValue>(emptyFilters)
  const [sortBy, setSortBy] = useState<SortKey>("relevance")
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)

  const q = useDebouncedValue(query, 180).trim()

  const handbookYear = handbookYearFor(0, state.courseYear, availableYears)

  // The same pool the search dialog suggests from, in course order.
  const suggestions = useMemo<PlannerUnit[]>(
    () =>
      course
        ? suggestionPool(course, plannedCodes, units).slice(0, SUGGESTION_LIMIT)
        : [],
    [course, plannedCodes, units]
  )

  useEffect(() => {
    if (!q) return
    let cancelled = false
    searchUnitsAction(q, handbookYear)
      .then((list) => {
        if (!cancelled) setFound({ query: q, units: list })
      })
      .catch(() => {
        if (!cancelled) setFound({ query: q, units: [] })
      })
    return () => {
      cancelled = true
    }
  }, [q, handbookYear])

  const hasQuery = q !== ""
  const loading = hasQuery && found?.query !== q
  const results = useMemo(() => found?.units ?? [], [found])
  const resultBundle = useMemo<UnitBundle>(
    () => ({
      units: Object.fromEntries(results.map((u) => [u.code, u])),
      offerings: {},
      requisites: {},
    }),
    [results]
  )

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
    setFilters(emptyFilters())
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
      <div className="flex items-center gap-2 rounded-control border bg-muted/30 px-3 py-2">
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
        <UnitDataOverlay bundle={resultBundle}>
          <ResultSection
            title="Search results"
            count={loading ? null : searchItems.length}
          >
            {loading ? (
              <EmptyResultState message="Searching…" />
            ) : searchItems.length === 0 ? (
              results.length === 0 ? (
                <EmptyResultState message={`No matches for "${q}"`} />
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
        </UnitDataOverlay>
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
