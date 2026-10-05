"use client"

import {
  ArrowLeftIcon,
  CheckIcon,
  InfoIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import posthog from "posthog-js"

import { searchUnitsRichAction } from "@/app/actions"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  buildPersonalSignals,
  rankCandidates,
  slotContextFor,
  suggestionPool,
  topFeatures,
  type RankedCandidate,
} from "@/lib/planner/personalize-search"
import {
  PERIOD_KIND_LABEL,
  PERIOD_KIND_ORDER,
  PERIOD_KIND_SHORT,
} from "@/lib/planner/teaching-period"
import {
  handbookYearFor,
  slotLabel as timelineSlotLabel,
} from "@/lib/planner/timeline"
import type {
  PeriodKind,
  PlannerOffering,
  PlannerUnit,
} from "@/lib/planner/types"
import type { UnitBundle } from "@/lib/planner/unit-cache"
import { isOfferedInPeriod } from "@/lib/planner/validation"
import { cn } from "@/lib/utils"

import { UnitDataOverlay, usePlanner } from "./planner-context"
import { UnitDetailView } from "./unit-detail-popover"

const SEARCH_DISPLAY_LIMIT = 50
const SUGGEST_DISPLAY_LIMIT = 25

const OpenUnitSearchCtx = createContext<
  (yearIndex: number, slotIndex: number) => void
>(() => {})

/** Opens the plan's unit search dialog for one semester. */
export function useOpenUnitSearch() {
  return useContext(OpenUnitSearchCtx)
}

/**
 * One unit search dialog for the whole plan; each semester's "Add
 * unit" button opens it for that semester. The target outlives the
 * close, so the dialog keeps its content through the exit animation.
 */
export function UnitSearchProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [target, setTarget] = useState<{
    yearIndex: number
    slotIndex: number
  } | null>(null)
  const [open, setOpen] = useState(false)
  const openFor = useCallback((yearIndex: number, slotIndex: number) => {
    setTarget({ yearIndex, slotIndex })
    setOpen(true)
  }, [])

  return (
    <OpenUnitSearchCtx.Provider value={openFor}>
      {children}
      {target ? (
        <UnitSearchDialog
          open={open}
          onOpenChangeAction={setOpen}
          yearIndex={target.yearIndex}
          slotIndex={target.slotIndex}
        />
      ) : null}
    </OpenUnitSearchCtx.Provider>
  )
}

/** Results of the latest search, kept out of the planner's own maps. */
interface Found {
  query: string
  bundle: UnitBundle
  rank: Map<string, number>
}

function UnitSearchDialog({
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
  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      {/* Below md the dialog is a full-screen sheet. */}
      <DialogContent
        className="h-[min(82vh,720px)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 max-md:inset-0 max-md:h-dvh max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:ring-0 sm:max-w-[960px]"
        showCloseButton={false}
      >
        {/* The popup mounts its children only while open, so a closed
            dialog does no ranking, and each opening starts fresh. */}
        <UnitSearchBody
          key={`${yearIndex}:${slotIndex}`}
          yearIndex={yearIndex}
          slotIndex={slotIndex}
          onClose={() => onOpenChangeAction(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function UnitSearchBody(props: {
  yearIndex: number
  slotIndex: number
  onClose: () => void
}) {
  const [found, setFound] = useState<Found | null>(null)
  return (
    <UnitDataOverlay bundle={found?.bundle ?? null}>
      <UnitSearchView {...props} found={found} onFound={setFound} />
    </UnitDataOverlay>
  )
}

function UnitSearchView({
  yearIndex,
  slotIndex,
  onClose,
  found,
  onFound,
}: {
  yearIndex: number
  slotIndex: number
  onClose: () => void
  found: Found | null
  onFound: (found: Found) => void
}) {
  // Inside the overlay: units, offerings and requisites include the
  // search results.
  const {
    addUnit,
    state,
    course,
    units,
    offerings,
    requisites,
    plannedCodes,
    availableYears,
  } = usePlanner()
  const [query, setQuery] = useState("")
  const [focusIndex, setFocusIndex] = useState(0)
  // Below md the list and the details take turns: the code shown in
  // place of the list, or null for the list.
  const [mobileDetail, setMobileDetail] = useState<string | null>(null)

  const q = useDebouncedValue(query, 180).trim()
  const slot = state.years[yearIndex]?.slots[slotIndex]
  const slotKind = slot?.kind
  // Adding is blocked per-SLOT, not per-plan: a student who failed a
  // unit retakes it in a later semester, and five separate pieces of
  // feedback called the plan-wide block out. Being on the plan
  // elsewhere is still surfaced (a soft "on plan" chip) so an
  // accidental double-add stays visible.
  const slotCodes = useMemo(
    () => new Set(slot?.unitCodes ?? []),
    [slot?.unitCodes]
  )
  const slotLabel = slot
    ? timelineSlotLabel(state, yearIndex, slot)
    : "this slot"
  const handbookYear = handbookYearFor(
    yearIndex,
    state.courseYear,
    availableYears
  )

  // Personalisation signals — derived from the plan + course graph
  // once per plan change. Cheap O(units-in-plan); we memoise so a
  // typing burst doesn't re-walk the AoS / requisite trees on every
  // keystroke.
  const signals = useMemo(
    () => buildPersonalSignals(state, course, requisites),
    [state, course, requisites]
  )
  const slotCtx = useMemo(
    () => slotContextFor(state, yearIndex, slotIndex, units),
    [state, yearIndex, slotIndex, units]
  )

  // Search: one network roundtrip pulls a wider candidate pool plus
  // their offerings + requisites in a single bundle. We then rerank
  // locally with `signals` so the right slot / AoS / level wins.
  useEffect(() => {
    if (!q) return
    let cancelled = false
    searchUnitsRichAction(q, handbookYear)
      .then(({ rank, ...bundle }) => {
        if (!cancelled)
          onFound({ query: q, bundle, rank: new Map(Object.entries(rank)) })
      })
      .catch(() => {
        if (!cancelled)
          onFound({
            query: q,
            bundle: { units: {}, offerings: {}, requisites: {} },
            rank: new Map(),
          })
      })
    return () => {
      cancelled = true
    }
  }, [q, handbookYear, onFound])
  const loading = q !== "" && found?.query !== q
  const resultCount = found ? Object.keys(found.bundle.units).length : 0

  // Display list — ranked by `personalScore`. With no query: the
  // course / AoS units the student could still take, ranked with no
  // text signal, so the top is "fits the slot, satisfies an unmet
  // requirement group, and is the right level for this year" — i.e.
  // literally the next move. With a query: the server's text-match
  // candidates, reranked so the textRank becomes one feature among
  // many rather than the only sort key.
  const ranked = useMemo<RankedCandidate[]>(() => {
    const args = {
      signals,
      slot: slotCtx,
      offeringsByCode: offerings,
      requisitesByCode: requisites,
    }
    if (!q) {
      if (!course) return []
      return rankCandidates(
        suggestionPool(course, plannedCodes, units),
        args
      ).slice(0, SUGGEST_DISPLAY_LIMIT)
    }
    if (!found) return []
    return rankCandidates(Object.values(found.bundle.units), {
      ...args,
      rankByCode: found.rank,
    }).slice(0, SEARCH_DISPLAY_LIMIT)
  }, [
    q,
    found,
    course,
    plannedCodes,
    units,
    offerings,
    requisites,
    signals,
    slotCtx,
  ])

  const items = useMemo(() => ranked.map((r) => r.unit), [ranked])
  const scoreByCode = useMemo(
    () => new Map(ranked.map((r) => [r.unit.code, r.score])),
    [ranked]
  )

  const focusAt = Math.min(focusIndex, Math.max(0, items.length - 1))
  const focused = items[focusAt]
  const detailCode = mobileDetail ?? focused?.code

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
        from_search: !!q,
        // Personalisation telemetry — lets us later learn weights from
        // which features mattered for the units users actually add.
        rank_score: score?.total,
        rank_top_features: score ? topFeatures(score) : undefined,
        rank_period_fit: score?.periodFit,
        rank_fills_gap: score?.fillsGap,
        rank_prereq_ready: score?.prereqReady,
      })
      addUnit(yearIndex, slotIndex, code)
      onClose()
    },
    [addUnit, yearIndex, slotIndex, slotKind, q, units, scoreByCode, onClose]
  )

  return (
    <>
      <DialogHeader className="sr-only">
        <DialogTitle>Search for a unit to add to {slotLabel}</DialogTitle>
      </DialogHeader>

      <div className="flex items-center gap-3 border-b px-4 py-3 max-md:gap-2 max-md:py-2 max-md:pr-2">
        {mobileDetail ? (
          <>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Back to results"
              className="-ml-2 md:hidden"
              onClick={() => setMobileDetail(null)}
            >
              <ArrowLeftIcon />
            </Button>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold md:hidden">
              {mobileDetail}
            </span>
          </>
        ) : null}
        <SearchIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground",
            mobileDetail && "max-md:hidden"
          )}
        />
        <Input
          autoFocus
          placeholder={`Search units for ${slotKind ? PERIOD_KIND_SHORT[slotKind] : "this slot"}…  (try FIT1045 or "algorithms")`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setFocusIndex(Math.min(items.length - 1, focusAt + 1))
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setFocusIndex(Math.max(0, focusAt - 1))
            } else if (e.key === "Enter") {
              e.preventDefault()
              if (focused && !slotCodes.has(focused.code)) {
                addAndClose(focused.code)
              }
            }
          }}
          className={cn(
            "h-9 border-none bg-transparent px-0 shadow-none focus-visible:ring-0",
            mobileDetail && "max-md:hidden"
          )}
        />
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Close"
              className="shrink-0 md:hidden"
            />
          }
        >
          <XIcon />
        </DialogClose>
      </div>

      <div className="grid min-h-0 grid-cols-1 md:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* List pane */}
        <div
          className={cn(
            "min-h-0 overflow-y-auto md:border-r",
            mobileDetail && "max-md:hidden"
          )}
        >
          <div className="p-1.5">
            {!q && items.length > 0 ? (
              <GroupHeading>Best picks for {slotLabel}</GroupHeading>
            ) : null}
            {q && loading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Searching…
              </div>
            ) : null}
            {q && !loading && resultCount === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No matches for &ldquo;{q}&rdquo;
              </div>
            ) : null}

            <ul className="flex flex-col gap-0.5">
              {items.map((u, i) => {
                const offs = offerings.get(u.code) ?? []
                const inSlot = slotCodes.has(u.code)
                return (
                  <li key={u.code} className="flex">
                    <UnitRow
                      unit={u}
                      offerings={offs}
                      slotKind={slotKind}
                      placed={inSlot}
                      onPlanElsewhere={!inSlot && plannedCodes.has(u.code)}
                      focused={i === focusAt}
                      onHover={() => setFocusIndex(i)}
                      onClick={() => {
                        if (!inSlot) addAndClose(u.code)
                      }}
                    />
                    {/* Phones have no details pane beside the list. */}
                    <button
                      type="button"
                      aria-label={`Details for ${u.code}`}
                      onClick={() => setMobileDetail(u.code)}
                      className="flex w-11 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-muted md:hidden"
                    >
                      <InfoIcon className="size-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        {/* Details pane — beside the list on md+, in its place below */}
        <div
          className={cn(
            "hidden min-h-0 flex-col bg-muted/20 md:flex",
            mobileDetail && "max-md:flex"
          )}
        >
          {detailCode ? (
            <FocusedDetails
              key={detailCode}
              code={detailCode}
              slotKind={slotKind}
              fits={
                slotKind
                  ? isOfferedInPeriod(offerings.get(detailCode) ?? [], slotKind)
                  : true
              }
              hasOfferingData={
                offerings.has(detailCode) ||
                (offerings.get(detailCode) ?? []).length > 0
              }
              placed={slotCodes.has(detailCode)}
              slotLabel={slotLabel}
              onAdd={() => addAndClose(detailCode)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {q ? "No unit selected." : "Start typing to search the handbook."}
            </div>
          )}
        </div>
      </div>
    </>
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
  onPlanElsewhere,
  focused,
  onHover,
  onClick,
}: {
  unit: PlannerUnit
  offerings: PlannerOffering[]
  slotKind: PeriodKind | undefined
  /** Already in THIS slot — the only hard non-action. */
  placed: boolean
  /** Somewhere else on the plan; addable (a retake), but worth saying. */
  onPlanElsewhere: boolean
  focused: boolean
  onHover: () => void
  onClick: () => void
}) {
  const periods = useMemo(() => {
    const s = new Set<PeriodKind>()
    for (const o of offerings) s.add(o.periodKind)
    return PERIOD_KIND_ORDER.filter((p) => s.has(p))
  }, [offerings])

  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onFocus={onHover}
      onClick={onClick}
      aria-disabled={placed ? "true" : undefined}
      className={cn(
        "flex w-full min-w-0 flex-col gap-1 rounded-control px-3 py-2 text-left text-sm transition-colors",
        focused ? "bg-accent text-accent-foreground" : "hover:bg-muted",
        // Non-fitting units are NOT dimmed at the row level — the chip
        // colours alone signal which period a unit runs in. Units already
        // in THIS slot still dim: that's the one hard non-action.
        placed && "cursor-not-allowed opacity-45"
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-xs font-semibold tabular-nums">
          {unit.code}
        </span>
        <span className="min-w-0 flex-1 truncate max-md:line-clamp-2 max-md:whitespace-normal">
          {unit.title}
        </span>
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
            <span className="ml-0.5">In this slot</span>
          </PeriodChip>
        ) : onPlanElsewhere ? (
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
        "inline-flex items-center rounded-control border px-1.5 py-0 text-[10px] font-medium tabular-nums",
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
            <span className="inline-flex items-center gap-1 rounded-control border border-border bg-muted px-2 py-0.5 font-medium text-muted-foreground">
              <CheckIcon className="size-3" /> Already in this slot
            </span>
          ) : !hasOfferingData ? (
            <span className="inline-flex items-center gap-1 rounded-control border border-border bg-muted px-2 py-0.5 font-medium text-muted-foreground">
              Checking fit for {PERIOD_KIND_LABEL[slotKind]}…
            </span>
          ) : fits ? (
            <span className="inline-flex items-center gap-1 rounded-control border border-success/30 bg-success-soft px-2 py-0.5 font-medium text-success-foreground">
              <CheckIcon className="size-3" />
              Fits {PERIOD_KIND_LABEL[slotKind]}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-control border border-warning/40 bg-warning-soft px-2 py-0.5 font-medium text-warning-foreground">
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
          {placed ? "In this slot" : `Add to ${slotLabel}`}
        </Button>
      </div>
    </div>
  )
}
