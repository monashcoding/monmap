"use client"

import { CheckIcon, SearchIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import posthog from "posthog-js"

import { searchUnitsRichAction } from "@/app/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  buildPersonalSignals,
  rankCandidates,
  slotContextFor,
  topFeatures,
  type ScoreBreakdown,
} from "@/lib/planner/personalize-search"
import {
  PERIOD_KIND_LABEL,
  PERIOD_KIND_SHORT,
} from "@/lib/planner/teaching-period"
import type {
  PeriodKind,
  PlannerOffering,
  PlannerUnit,
} from "@/lib/planner/types"
import { isOfferedInPeriod } from "@/lib/planner/validation"
import { cn } from "@/lib/utils"

import { usePlanner } from "./planner-context"
import { UnitDetailView } from "./unit-detail-popover"

const PERIOD_CHIP_ORDER: PeriodKind[] = [
  "S1",
  "S2",
  "SUMMER_A",
  "SUMMER_B",
  "WINTER",
  "FULL_YEAR",
  "OTHER",
]

const SEARCH_DISPLAY_LIMIT = 50
const SUGGEST_DISPLAY_LIMIT = 25

/**
 * Debounce helper — small inline implementation so we don't drag in
 * a library for one use. The caller invokes the fn immediately but
 * the wrapped callback is only invoked after `delayMs` of quiet.
 */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

export function UnitSearchDialog({
  open,
  onOpenChangeAction,
  yearIndex,
  slotIndex,
}: {
  open: boolean
  onOpenChangeAction: (v: boolean) => void
  yearIndex: number
  slotIndex: number
}) {
  const {
    addUnit,
    state,
    course,
    mergeUnits,
    mergeOfferings,
    mergeRequisites,
    units,
    offerings,
    requisites,
    plannedCodes,
    availableYears,
  } = usePlanner()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PlannerUnit[]>([])
  const [searchRank, setSearchRank] = useState<Map<string, number>>(
    () => new Map()
  )
  const [loading, setLoading] = useState(false)
  const [focusIndex, setFocusIndex] = useState(0)

  const debounced = useDebounced(query, 180)
  const slot = state.years[yearIndex]?.slots[slotIndex]
  const slotKind = slot?.kind
  const slotCalendarYear = useMemo(() => {
    const base = Number(state.courseYear) || new Date().getFullYear()
    return base + yearIndex
  }, [state.courseYear, yearIndex])
  const slotLabel =
    slot?.label ??
    (slotKind
      ? `${PERIOD_KIND_LABEL[slotKind]}, ${slotCalendarYear}`
      : "this slot")

  // Use the handbook year that corresponds to this study year, falling
  // back to the latest available if the exact year isn't in the DB.
  const handbookYear = useMemo(() => {
    const target = String(Number(state.courseYear) + yearIndex)
    if (availableYears.includes(target)) return target
    return [...availableYears].sort().at(-1) ?? state.courseYear
  }, [state.courseYear, yearIndex, availableYears])

  // Personalisation signals — derived from the plan + course graph
  // once per plan change. Cheap O(units-in-plan); we memoise so a
  // typing burst doesn't re-walk the AoS / requisite trees on every
  // keystroke.
  const signals = useMemo(
    () => buildPersonalSignals(state, course, requisites),
    [state, course, requisites]
  )
  const slotCtx = useMemo(
    () => slotContextFor(state, yearIndex, slotIndex),
    [state, yearIndex, slotIndex]
  )

  // Empty-query suggestions: the full pool of course / AoS units the
  // student could still take, ranked by personal score with no text
  // signal. The top of the list ends up being "fits the slot,
  // satisfies an unmet requirement group, and is the right level for
  // this year" — i.e. literally the next move.
  const suggestions = useMemo<PlannerUnit[]>(() => {
    if (!course) return []
    const seen = new Set<string>()
    const pool: PlannerUnit[] = []
    const consider = (code: string) => {
      if (seen.has(code) || plannedCodes.has(code)) return
      seen.add(code)
      const u = units.get(code)
      if (u) pool.push(u)
    }
    for (const cu of course.courseUnits) consider(cu.code)
    for (const aos of course.areasOfStudy)
      for (const u of aos.units) consider(u.code)
    if (pool.length === 0) return []
    return rankCandidates(pool, {
      signals,
      slot: slotCtx,
      offeringsByCode: offerings,
      requisitesByCode: requisites,
    })
      .slice(0, SUGGEST_DISPLAY_LIMIT)
      .map((r) => r.unit)
  }, [course, units, offerings, requisites, signals, slotCtx, plannedCodes])

  // Search: one network roundtrip pulls a wider candidate pool plus
  // their offerings + requisites in a single bundle. We then rerank
  // locally with `signals` so the right slot / AoS / level wins.
  useEffect(() => {
    let cancelled = false
    if (!debounced.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([])
      setSearchRank(new Map())
      setLoading(false)
      return
    }
    setLoading(true)
    searchUnitsRichAction(debounced, handbookYear)
      .then((res) => {
        if (cancelled) return
        const unitsList = Object.values(res.units)
        const rank = new Map(Object.entries(res.rank))
        setResults(unitsList)
        setSearchRank(rank)
        setLoading(false)
        mergeUnits(unitsList)
        mergeOfferings(res.offerings)
        mergeRequisites(res.requisites)
      })
      .catch(() => {
        if (cancelled) return
        setResults([])
        setSearchRank(new Map())
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced, handbookYear, mergeUnits, mergeOfferings, mergeRequisites])

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("")
      setResults([])
      setSearchRank(new Map())
      setFocusIndex(0)
    }
  }, [open])

  // Final display list — ranked by `personalScore`. For empty queries
  // we already ranked the suggestions pool above; for searches we
  // rerank the server's text-match candidates here so the textRank
  // becomes one feature among many rather than the only sort key.
  const ranked = useMemo(() => {
    if (debounced.trim()) {
      return rankCandidates(results, {
        signals,
        slot: slotCtx,
        offeringsByCode: offerings,
        requisitesByCode: requisites,
        rankByCode: searchRank,
      }).slice(0, SEARCH_DISPLAY_LIMIT)
    }
    return suggestions.map((u) => ({
      unit: u,
      // For suggestions we already ranked above; we still want the
      // breakdown for the add-event, so recompute cheaply.
      score: null as ScoreBreakdown | null,
    }))
  }, [
    debounced,
    results,
    suggestions,
    signals,
    slotCtx,
    offerings,
    requisites,
    searchRank,
  ])

  const items = useMemo(() => ranked.map((r) => r.unit), [ranked])
  const scoreByCode = useMemo(() => {
    const m = new Map<string, ScoreBreakdown>()
    for (const r of ranked) if (r.score) m.set(r.unit.code, r.score)
    return m
  }, [ranked])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (focusIndex >= items.length) setFocusIndex(Math.max(0, items.length - 1))
  }, [items.length, focusIndex])

  const focused = items[focusIndex]

  const addAndClose = useCallback(
    (code: string) => {
      const unit = units.get(code)
      const score = scoreByCode.get(code)
      posthog.capture("unit_added", {
        unit_code: code,
        unit_title: unit?.title,
        credit_points: unit?.creditPoints,
        year_index: yearIndex,
        slot_index: slotIndex,
        slot_kind: slotKind,
        from_search: !!debounced.trim(),
        // Personalisation telemetry — lets us later learn weights from
        // which features mattered for the units users actually add.
        rank_score: score?.total,
        rank_top_features: score ? topFeatures(score) : undefined,
        rank_period_fit: score?.periodFit,
        rank_fills_gap: score?.fillsGap,
        rank_prereq_ready: score?.prereqReady,
      })
      addUnit(yearIndex, slotIndex, code)
      onOpenChangeAction(false)
    },
    [
      addUnit,
      yearIndex,
      slotIndex,
      slotKind,
      debounced,
      units,
      scoreByCode,
      onOpenChangeAction,
    ]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent
        className="h-[min(82vh,720px)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-[960px]"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Search for a unit to add to {slotLabel}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 border-b px-4 py-3">
          <SearchIcon className="size-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder={`Search units for ${slotKind ? PERIOD_KIND_SHORT[slotKind] : "this slot"}…  (try FIT1045 or "algorithms")`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setFocusIndex((i) => Math.min(items.length - 1, i + 1))
              } else if (e.key === "ArrowUp") {
                e.preventDefault()
                setFocusIndex((i) => Math.max(0, i - 1))
              } else if (e.key === "Enter") {
                e.preventDefault()
                const picked = items[focusIndex]
                if (picked && !plannedCodes.has(picked.code)) {
                  addAndClose(picked.code)
                }
              }
            }}
            className="h-9 border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="grid min-h-0 grid-cols-1 md:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          {/* List pane */}
          <div className="min-h-0 overflow-y-auto md:border-r">
            <div className="p-1.5">
              {!debounced.trim() && suggestions.length > 0 ? (
                <GroupHeading>Best picks for {slotLabel}</GroupHeading>
              ) : null}
              {debounced.trim() && loading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Searching…
                </div>
              ) : null}
              {debounced.trim() && !loading && results.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No matches for &ldquo;{debounced}&rdquo;
                </div>
              ) : null}

              <ul className="flex flex-col gap-0.5">
                {items.map((u, i) => {
                  const offs = offerings.get(u.code) ?? []
                  const placed = plannedCodes.has(u.code)
                  return (
                    <li key={u.code}>
                      <UnitRow
                        unit={u}
                        offerings={offs}
                        slotKind={slotKind}
                        placed={placed}
                        focused={i === focusIndex}
                        onHover={() => setFocusIndex(i)}
                        onClick={() => {
                          if (!placed) addAndClose(u.code)
                        }}
                      />
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>

          {/* Details pane — visible on md+ */}
          <div className="hidden min-h-0 flex-col bg-muted/20 md:flex">
            {focused ? (
              <FocusedDetails
                key={focused.code}
                code={focused.code}
                slotKind={slotKind}
                fits={
                  slotKind
                    ? isOfferedInPeriod(
                        offerings.get(focused.code) ?? [],
                        slotKind
                      )
                    : true
                }
                hasOfferingData={
                  offerings.has(focused.code) ||
                  (offerings.get(focused.code) ?? []).length > 0
                }
                placed={plannedCodes.has(focused.code)}
                slotLabel={slotLabel}
                onAdd={() => addAndClose(focused.code)}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                {debounced.trim()
                  ? "No unit selected."
                  : "Start typing to search the handbook."}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-2 text-[10px] tracking-wide text-muted-foreground uppercase">
      {children}
    </div>
  )
}

function UnitRow({
  unit,
  offerings,
  slotKind,
  placed,
  focused,
  onHover,
  onClick,
}: {
  unit: PlannerUnit
  offerings: PlannerOffering[]
  slotKind: PeriodKind | undefined
  placed: boolean
  focused: boolean
  onHover: () => void
  onClick: () => void
}) {
  const periods = useMemo(() => {
    const s = new Set<PeriodKind>()
    for (const o of offerings) s.add(o.periodKind)
    return PERIOD_CHIP_ORDER.filter((p) => s.has(p))
  }, [offerings])

  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onFocus={onHover}
      onClick={onClick}
      aria-disabled={placed ? "true" : undefined}
      className={cn(
        "flex w-full flex-col gap-1 rounded-xl px-3 py-2 text-left text-sm transition-colors",
        focused ? "bg-accent text-accent-foreground" : "hover:bg-muted",
        // Non-fitting units are NOT dimmed at the row level — the chip
        // colours alone signal which period a unit runs in. Placed units
        // still dim, since "already on plan" is a hard non-action.
        placed && "cursor-not-allowed opacity-45"
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-xs font-semibold tabular-nums">
          {unit.code}
        </span>
        <span className="min-w-0 flex-1 truncate">{unit.title}</span>
        <span
          className={cn(
            "shrink-0 text-[10px] tabular-nums",
            focused ? "text-accent-foreground/70" : "text-muted-foreground"
          )}
        >
          {unit.creditPoints}cp
        </span>
      </div>
      <div className="flex items-center gap-1">
        {placed ? (
          <PeriodChip>
            <CheckIcon className="size-2.5" />
            <span className="ml-0.5">On plan</span>
          </PeriodChip>
        ) : null}
        {periods.length === 0 ? (
          <span
            className={cn(
              "text-[10px] italic",
              focused ? "text-accent-foreground/70" : "text-muted-foreground"
            )}
          >
            {offerings.length === 0 ? "Checking offerings…" : "Off-cycle"}
          </span>
        ) : (
          periods.map((p) => (
            <PeriodChip key={p} highlighted={slotKind === p}>
              {PERIOD_KIND_SHORT[p]}
            </PeriodChip>
          ))
        )}
      </div>
    </button>
  )
}

function PeriodChip({
  children,
  highlighted,
}: {
  children: React.ReactNode
  highlighted?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0 text-[10px] font-medium tabular-nums",
        // Always render solid — chips for units that don't fit the slot
        // keep the same colour, the row's opacity handles the "less
        // relevant" cue without washing the chip out.
        highlighted
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-muted text-foreground"
      )}
    >
      {children}
    </span>
  )
}

function FocusedDetails({
  code,
  slotKind,
  fits,
  hasOfferingData,
  placed,
  slotLabel,
  onAdd,
}: {
  code: string
  slotKind: PeriodKind | undefined
  fits: boolean
  hasOfferingData: boolean
  placed: boolean
  slotLabel: string
  onAdd: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {slotKind ? (
        <div className="flex shrink-0 items-center gap-2 border-b bg-card px-4 py-2 text-xs">
          {placed ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 font-medium text-muted-foreground">
              <CheckIcon className="size-3" /> Already on plan
            </span>
          ) : !hasOfferingData ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 font-medium text-muted-foreground">
              Checking fit for {PERIOD_KIND_LABEL[slotKind]}…
            </span>
          ) : fits ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success-soft px-2 py-0.5 font-medium text-success-foreground">
              <CheckIcon className="size-3" />
              Fits {PERIOD_KIND_LABEL[slotKind]}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning-soft px-2 py-0.5 font-medium text-warning-foreground">
              Not offered in {PERIOD_KIND_LABEL[slotKind]}
            </span>
          )}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <UnitDetailView code={code} className="p-4" />
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-card px-3 py-2">
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={placed}
          onClick={onAdd}
        >
          {placed ? "On plan" : `Add to ${slotLabel}`}
        </Button>
      </div>
    </div>
  )
}
