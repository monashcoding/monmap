"use client"

import {
  CheckIcon,
  ChevronDownIcon,
  FilterIcon,
  ListOrderedIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { searchUnitsAction } from "@/app/actions"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  PERIOD_KIND_LABEL,
  PERIOD_KIND_SHORT,
} from "@/lib/planner/teaching-period"
import type { PeriodKind, PlannerUnit } from "@/lib/planner/types"
import { cn } from "@/lib/utils"

import { DraggableUnitRow } from "./draggable-unit-row"
import { usePlanner } from "./planner-context"

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

function extractLevelNum(level: string | null): number | null {
  if (!level) return null
  const m = level.match(/\d+/)
  return m ? Number(m[0]) : null
}

function toggle<T>(set: Set<T>, val: T): Set<T> {
  const next = new Set(set)
  if (next.has(val)) next.delete(val)
  else next.add(val)
  return next
}

const LEVEL_OPTIONS = [1, 2, 3, 4]
const CP_OPTIONS = [6, 12, 18, 24]
const PERIOD_OPTIONS: PeriodKind[] = [
  "S1",
  "S2",
  "FULL_YEAR",
  "SUMMER_A",
  "WINTER",
]
const CAMPUS_OPTIONS = ["Clayton", "Caulfield", "Malaysia"]
const MODE_OPTIONS = [
  { code: "ON-CAMPUS", label: "On-campus" },
  { code: "ONLINE", label: "Online" },
]
const SORT_OPTIONS = [
  { key: "relevance", label: "Relevance", short: "Relevance" },
  { key: "level-asc", label: "Level (low → high)", short: "Level ↑" },
  { key: "level-desc", label: "Level (high → low)", short: "Level ↓" },
  { key: "credit", label: "Credit points (low → high)", short: "Credits ↑" },
  { key: "code", label: "Unit code (A → Z)", short: "Code A–Z" },
] as const
type SortKey = (typeof SORT_OPTIONS)[number]["key"]

const CHIP_BASE =
  "flex items-center justify-center rounded-lg text-xs font-medium transition-all border"
const CHIP_ACTIVE =
  "border-primary bg-primary text-primary-foreground shadow-sm"
const CHIP_IDLE =
  "border-transparent bg-muted text-foreground hover:border-primary/60 hover:bg-primary/40"

export function UnitSearchPanel() {
  const { state, course, units, offerings, availableYears, mergeUnits } =
    usePlanner()

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PlannerUnit[]>([])
  const [loading, setLoading] = useState(false)

  const [levelFilter, setLevelFilter] = useState<Set<number>>(new Set())
  const [cpFilter, setCpFilter] = useState<Set<number>>(new Set())
  const [periodFilter, setPeriodFilter] = useState<Set<PeriodKind>>(new Set())
  const [campusFilter, setCampusFilter] = useState<Set<string>>(new Set())
  const [modeFilter, setModeFilter] = useState<Set<string>>(new Set())
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
    levelFilter.size > 0 ||
    cpFilter.size > 0 ||
    periodFilter.size > 0 ||
    campusFilter.size > 0 ||
    modeFilter.size > 0

  const activeFilterCount =
    levelFilter.size +
    cpFilter.size +
    periodFilter.size +
    campusFilter.size +
    modeFilter.size

  const applyFiltersAndSort = useMemo(() => {
    return (input: PlannerUnit[]): PlannerUnit[] => {
      let list = [...input]

      if (levelFilter.size > 0) {
        list = list.filter((u) => {
          const n = extractLevelNum(u.level)
          return n !== null && levelFilter.has(n)
        })
      }

      if (cpFilter.size > 0) {
        list = list.filter((u) => cpFilter.has(u.creditPoints))
      }

      if (
        periodFilter.size > 0 ||
        campusFilter.size > 0 ||
        modeFilter.size > 0
      ) {
        list = list.filter((u) => {
          const offs = offerings.get(u.code)
          if (!offs || offs.length === 0) return true
          return offs.some((o) => {
            if (periodFilter.size > 0 && !periodFilter.has(o.periodKind))
              return false
            if (campusFilter.size > 0 && !campusFilter.has(o.location ?? ""))
              return false
            if (
              modeFilter.size > 0 &&
              !modeFilter.has(o.attendanceModeCode ?? "")
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
  }, [
    levelFilter,
    cpFilter,
    periodFilter,
    campusFilter,
    modeFilter,
    sortBy,
    offerings,
  ])

  const searchItems = useMemo(
    () => applyFiltersAndSort(results),
    [results, applyFiltersAndSort]
  )

  function clearFilters() {
    setLevelFilter(new Set())
    setCpFilter(new Set())
    setPeriodFilter(new Set())
    setCampusFilter(new Set())
    setModeFilter(new Set())
  }

  const activeChips: Array<{ key: string; label: string; remove: () => void }> =
    []
  for (const lvl of levelFilter) {
    activeChips.push({
      key: `lvl-${lvl}`,
      label: `Level ${lvl}`,
      remove: () => setLevelFilter((s) => toggle(s, lvl)),
    })
  }
  for (const cp of cpFilter) {
    activeChips.push({
      key: `cp-${cp}`,
      label: `${cp}cp`,
      remove: () => setCpFilter((s) => toggle(s, cp)),
    })
  }
  for (const p of periodFilter) {
    activeChips.push({
      key: `p-${p}`,
      label: PERIOD_KIND_LABEL[p],
      remove: () => setPeriodFilter((s) => toggle(s, p)),
    })
  }
  for (const c of campusFilter) {
    activeChips.push({
      key: `c-${c}`,
      label: c,
      remove: () => setCampusFilter((s) => toggle(s, c)),
    })
  }
  for (const m of modeFilter) {
    const opt = MODE_OPTIONS.find((o) => o.code === m)
    activeChips.push({
      key: `m-${m}`,
      label: opt?.label ?? m,
      remove: () => setModeFilter((s) => toggle(s, m)),
    })
  }

  const sortOption = SORT_OPTIONS.find((o) => o.key === sortBy)

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Search bar */}
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

      {/* Filter / Sort row */}
      <div className="flex items-center gap-2">
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger
            render={
              <Button
                size="sm"
                variant={hasActiveFilters ? "default" : "outline"}
                className="h-7 gap-1.5 rounded-lg px-2.5 text-xs"
              >
                <FilterIcon className="size-3" />
                Filters
                {hasActiveFilters && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-primary-foreground/20 text-[10px] leading-none tabular-nums">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            }
          />
          <PopoverContent align="start" sideOffset={6} className="w-64 p-0">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <p className="text-sm font-semibold">Filters</p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="flex flex-col gap-4 px-4 pt-2.5 pb-4">
              <FilterSection label="Level">
                {LEVEL_OPTIONS.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setLevelFilter((s) => toggle(s, lvl))}
                    className={cn(
                      CHIP_BASE,
                      "h-8 w-10",
                      levelFilter.has(lvl) ? CHIP_ACTIVE : CHIP_IDLE
                    )}
                  >
                    {lvl}
                  </button>
                ))}
              </FilterSection>

              <FilterSection label="Credit points">
                {CP_OPTIONS.map((cp) => (
                  <button
                    key={cp}
                    type="button"
                    onClick={() => setCpFilter((s) => toggle(s, cp))}
                    className={cn(
                      CHIP_BASE,
                      "h-8 px-3",
                      cpFilter.has(cp) ? CHIP_ACTIVE : CHIP_IDLE
                    )}
                  >
                    {cp}cp
                  </button>
                ))}
              </FilterSection>

              <FilterSection label="Offered in">
                {PERIOD_OPTIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriodFilter((s) => toggle(s, p))}
                    className={cn(
                      CHIP_BASE,
                      "h-8 px-3",
                      periodFilter.has(p) ? CHIP_ACTIVE : CHIP_IDLE
                    )}
                  >
                    {PERIOD_KIND_SHORT[p]}
                  </button>
                ))}
              </FilterSection>

              <FilterSection label="Campus">
                {CAMPUS_OPTIONS.map((campus) => (
                  <button
                    key={campus}
                    type="button"
                    onClick={() => setCampusFilter((s) => toggle(s, campus))}
                    className={cn(
                      CHIP_BASE,
                      "h-8 px-3",
                      campusFilter.has(campus) ? CHIP_ACTIVE : CHIP_IDLE
                    )}
                  >
                    {campus}
                  </button>
                ))}
              </FilterSection>

              <FilterSection label="Mode">
                {MODE_OPTIONS.map(({ code, label }) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setModeFilter((s) => toggle(s, code))}
                    className={cn(
                      CHIP_BASE,
                      "h-8 px-3",
                      modeFilter.has(code) ? CHIP_ACTIVE : CHIP_IDLE
                    )}
                  >
                    {label}
                  </button>
                ))}
              </FilterSection>
            </div>
          </PopoverContent>
        </Popover>

        <Popover open={sortOpen} onOpenChange={setSortOpen}>
          <PopoverTrigger
            render={
              <Button
                size="sm"
                variant={sortBy !== "relevance" ? "default" : "outline"}
                className="h-7 gap-1.5 rounded-lg px-2.5 text-xs"
              >
                <ListOrderedIcon className="size-3" />
                {sortBy === "relevance" ? "Sort" : sortOption?.short}
              </Button>
            }
          />
          <PopoverContent align="start" sideOffset={6} className="w-48 p-0">
            <div className="p-1.5">
              {SORT_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSortBy(key)
                    setSortOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-primary/40",
                    sortBy === key
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <span>{label}</span>
                  {sortBy === key && (
                    <CheckIcon className="size-3.5 shrink-0 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.remove}
              className="inline-flex items-center gap-1 rounded-full bg-primary/40 px-2 py-0.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/60"
              aria-label={`Remove filter: ${chip.label}`}
            >
              {chip.label}
              <XIcon className="size-3 opacity-70" />
            </button>
          ))}
          {activeChips.length > 1 && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Search results */}
      {hasQuery && (
        <ResultSection
          title="Search results"
          count={loading ? null : searchItems.length}
        >
          {loading ? (
            <EmptyState message="Searching…" />
          ) : searchItems.length === 0 ? (
            results.length === 0 ? (
              <EmptyState message={`No matches for "${debounced}"`} />
            ) : (
              <EmptyState
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

      {/* Suggested from course — always rendered, ignores filters/sort */}
      <div className="-mx-3 border-t px-3 pt-3">
        <ResultSection
          title="Suggested from your course"
          count={suggestions.length}
          collapsible
        >
          {suggestions.length === 0 ? (
            <EmptyState
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

function FilterSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function ResultSection({
  title,
  count,
  collapsible,
  children,
}: {
  title: string
  count: number | null
  collapsible?: boolean
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const showToggle = collapsible === true
  return (
    <div className="flex flex-col gap-1">
      {showToggle ? (
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="-mx-1 flex items-center justify-between rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/40"
        >
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {title}
          </p>
          <ChevronDownIcon
            className={cn(
              "size-3.5 text-muted-foreground transition-transform",
              collapsed && "-rotate-90",
            )}
          />
        </button>
      ) : (
        <div className="flex items-center justify-between px-1">
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {title}
          </p>
          {count !== null && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {count}
            </span>
          )}
        </div>
      )}
      {!(showToggle && collapsed) && (
        <div className="flex flex-col gap-0.5">{children}</div>
      )}
    </div>
  )
}

function EmptyState({
  message,
  action,
}: {
  message: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center">
      <p className="text-xs text-muted-foreground">{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="text-[11px] font-medium text-primary-foreground rounded-full bg-primary/40 px-2.5 py-0.5 transition-colors hover:bg-primary/60"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
