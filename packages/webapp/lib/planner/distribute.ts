import {
  slotCapacity,
  STANDARD_CP,
  type PeriodKind,
  type PlannerOffering,
  type PlannerState,
  type PlannerUnit,
  type RequisiteBlock,
  type RequisiteRule,
} from "./types.ts"

export interface Placement {
  code: string
  yearIndex: number
  slotIndex: number
}

export interface DistributeResult {
  placements: Placement[]
  /** Codes skipped because they are already on the plan. */
  skipped: string[]
}

const MAX_OVERFLOW_YEARS = 4

/**
 * Bulk-place a set of unit codes onto the planner, respecting handbook
 * level (year band), offering periods (S1/S2/FY), and — critically —
 * prerequisite ordering inside the loaded set. A unit whose prereq is
 * also being loaded must land in a later semester than the prereq,
 * never the same one and never earlier; the upstream level-only sort
 * silently violated this when multiple Level-1 cores depended on each
 * other (e.g. comp sci 2026 loading FIT1008 into S1 ahead of its
 * prereq FIT1045).
 *
 * IBL units are special-cased. Monash's Industry-Based Learning
 * placements (FIT3045 / FIT4042, both 18 CP) are offered only in
 * "Term 2" or "Term 4" with attendance_mode IMMERSIVE — neither
 * matches an S1/S2 teaching period, so `classifyTeachingPeriod` flags
 * every offering as `OTHER`. The naive S1/S2 fallback would jam a
 * full-time year-long placement into one regular semester. We instead
 * treat term-only credit-bearing units as full-year-equivalent and
 * book them across both halves of the year. Their 0-CP companion
 * units (FIT2108 seminar, FIT3201/FIT3202 onboarding) contribute zero
 * weight to slot fill so they don't displace real units.
 */
export function distribute(args: {
  codes: readonly string[]
  units: ReadonlyMap<string, PlannerUnit>
  offerings: ReadonlyMap<string, PlannerOffering[]>
  state: PlannerState
  /** Optional — when present, placement honours prereq ordering. */
  requisites?: ReadonlyMap<string, RequisiteBlock[]>
}): DistributeResult {
  const { codes, units, offerings, state, requisites } = args

  const planned = new Set(
    state.years.flatMap((y) => y.slots.flatMap((s) => s.unitCodes))
  )

  const skipped: string[] = []
  const queueSet = new Set<string>()
  for (const c of new Set(codes)) {
    if (planned.has(c)) skipped.push(c)
    else queueSet.add(c)
  }

  // Prereq subgraph restricted to (queue ∪ already-planned). Already-
  // planned codes act as "depth-0 anchors" — we never re-order them,
  // but their existing slot positions still constrain where new codes
  // can land.
  const prereqEdges = buildPrereqEdges(
    requisites,
    new Set([...queueSet, ...planned])
  )

  // Order the queue by (level band, then prereq depth, then code). The
  // depth tiebreak is what fixes the FIT1008-before-FIT1045 bug:
  // FIT1008's depth is 1 (depends on FIT1045 which is in the queue),
  // so it sorts after FIT1045 even though both are Level 1.
  const depth = computeDepths([...queueSet], prereqEdges)
  const queue = [...queueSet].sort((a, b) => {
    const la = levelOf(units.get(a)?.level)
    const lb = levelOf(units.get(b)?.level)
    if (la !== lb) return la - lb
    const da = depth.get(a) ?? 0
    const db = depth.get(b) ?? 0
    if (da !== db) return da - db
    return a.localeCompare(b)
  })

  // Slot fill tracked in *credit-weight* units, not unit count. That
  // way an 18 CP IBL placement consumes ~3 of a slot's standard 4-unit
  // capacity and a 0 CP companion consumes 0 — versus the count-based
  // version that let either silently misreport load.
  const fill: number[][] = state.years.map((y, yi) =>
    y.slots.map((s) =>
      s.unitCodes.reduce(
        (sum, c) =>
          sum + perSlotWeight(c, units, offerings, isAcrossYear(yi, c, state)),
        0
      )
    )
  )
  const ensureYear = (yi: number) => {
    while (fill.length <= yi) fill.push([0, 0])
  }
  const slotIdx = (yi: number, kind: PeriodKind): number =>
    state.years[yi]?.slots.findIndex((s) => s.kind === kind) ?? -1
  const capOf = (yi: number, si: number): number => {
    const s = state.years[yi]?.slots[si]
    return s ? slotCapacity(s) : 4
  }

  // Track every placement (both pre-existing and newly added) so we
  // can ask "where did X end up?" when placing a unit that depends on
  // it. FULL_YEAR codes occupy both slots and must be treated as
  // "this whole year" for prereq-ordering purposes.
  const placedAt = new Map<string, { yearIndex: number; kind: PeriodKind }>()
  state.years.forEach((y, yi) => {
    y.slots.forEach((s) => {
      for (const code of s.unitCodes) {
        const offers = offerings.get(code) ?? []
        const cp = units.get(code)?.creditPoints ?? STANDARD_CP
        const yearBlocking = isYearBlocking(offers, cp)
        const existing = placedAt.get(code)
        if (existing && existing.yearIndex === yi) {
          if (yearBlocking)
            placedAt.set(code, { yearIndex: yi, kind: "FULL_YEAR" })
          continue
        }
        placedAt.set(code, {
          yearIndex: yi,
          kind: yearBlocking ? "FULL_YEAR" : s.kind,
        })
      }
    })
  })

  const placements: Placement[] = []
  const maxYears = state.years.length + MAX_OVERFLOW_YEARS

  for (const code of queue) {
    const unit = units.get(code)
    const cp = unit?.creditPoints ?? STANDARD_CP
    const baseYear = yearForLevel(unit?.level, state.years.length)
    const offers = offerings.get(code) ?? []
    const hasOfferings = offers.length > 0
    const offersS1 = offers.some((o) => o.periodKind === "S1")
    const offersS2 = offers.some((o) => o.periodKind === "S2")
    const offersFY = offers.some((o) => o.periodKind === "FULL_YEAR")
    const offersOnlyOther =
      hasOfferings && offers.every((o) => o.periodKind === "OTHER")
    // True FY: only available as a year-long unit, no S1/S2 alternative.
    // IBL-like: credit-bearing unit with all offerings classified as
    // OTHER (Term 2 / Trimester 2 / field-school) — practically a
    // full-year commitment to the student.
    const isYearLong =
      (offersFY && !offersS1 && !offersS2) || (offersOnlyOther && cp >= 12)

    // Earliest (year, slot-rank) this code may occupy, derived from
    // prereqs already placed. slot-rank: 0=S1, 1=S2.
    // A prereq in S1 yi=Y → this can land yi=Y S2 at earliest.
    // A prereq in S2 yi=Y → this can land yi=Y+1 S1 at earliest.
    // A prereq FULL_YEAR in yi=Y → this can land yi=Y+1 S1 at earliest.
    // A term-only prereq (offerings all classify as OTHER) is "year-
    // locked" but not "half-of-year locked" — its actual term might be
    // T1 (before S1) or T3 (after S2). On the S1/S2 grid we can't tell,
    // so we treat same-year placement as satisfying the edge rather
    // than bumping the dependent to the next year. Important for the
    // IBL chain: FIT3202 (T1 onboarding) → FIT3045 (T2 placement) both
    // happen in the same calendar year in reality.
    let minYear = baseYear
    let minRank = 0
    for (const pre of prereqEdges.get(code) ?? []) {
      const p = placedAt.get(pre)
      if (!p) continue
      const preOffers = offerings.get(pre) ?? []
      const preTermOnly =
        preOffers.length > 0 && preOffers.every((o) => o.periodKind === "OTHER")
      let needYear = p.yearIndex
      let needRank = 1
      if (p.kind === "FULL_YEAR") {
        needYear = p.yearIndex + 1
        needRank = 0
      } else if (preTermOnly) {
        // Same year, no within-year ordering — see comment above.
        needYear = p.yearIndex
        needRank = 0
      } else if (p.kind === "S2") {
        needYear = p.yearIndex + 1
        needRank = 0
      }
      if (needYear > minYear || (needYear === minYear && needRank > minRank)) {
        minYear = needYear
        minRank = needRank
      }
    }

    if (isYearLong) {
      // Year-long needs both halves free *and* must start no earlier
      // than the prereq constraint allows. minRank 1 forces moving to
      // next year because a year-long unit can't start in S2.
      const startYear = minRank > 0 ? minYear + 1 : minYear
      const halfWeight = perSlotWeight(code, units, offerings, true)
      let placed = false
      for (let yi = startYear; yi < maxYears && !placed; yi++) {
        ensureYear(yi)
        const s1 = slotIdx(yi, "S1")
        const s2 = slotIdx(yi, "S2")
        if (s1 < 0 || s2 < 0) continue
        if (
          (fill[yi]?.[s1] ?? 0) + halfWeight <= capOf(yi, s1) &&
          (fill[yi]?.[s2] ?? 0) + halfWeight <= capOf(yi, s2)
        ) {
          placements.push({ code, yearIndex: yi, slotIndex: s1 })
          placements.push({ code, yearIndex: yi, slotIndex: s2 })
          const row = (fill[yi] ??= [0, 0])
          row[s1] = (row[s1] ?? 0) + halfWeight
          row[s2] = (row[s2] ?? 0) + halfWeight
          placedAt.set(code, { yearIndex: yi, kind: "FULL_YEAR" })
          placed = true
        }
      }
      continue
    }

    // Fallback: unknown offerings OR only Summer/Winter — treat as both
    // S1 and S2 candidates so the unit lands somewhere; the validator
    // will surface "not offered in period" rather than silently dropping.
    const wantsS1 = !hasOfferings || offersS1 || (!offersS1 && !offersS2)
    const wantsS2 = !hasOfferings || offersS2 || (!offersS1 && !offersS2)
    const weight = perSlotWeight(code, units, offerings, false)

    let placed = false
    for (let yi = minYear; yi < maxYears && !placed; yi++) {
      ensureYear(yi)
      const s1 = slotIdx(yi, "S1")
      const s2 = slotIdx(yi, "S2")
      // Apply prereq slot-rank floor only for the first eligible year.
      // After that, both semesters are fair game.
      const rankFloor = yi === minYear ? minRank : 0
      const candidates: { si: number; rank: number }[] = []
      if (wantsS1 && s1 >= 0 && rankFloor <= 0) {
        candidates.push({ si: s1, rank: 0 })
      }
      if (wantsS2 && s2 >= 0 && rankFloor <= 1) {
        candidates.push({ si: s2, rank: 1 })
      }
      // Prefer the slot with less load, breaking ties by rank (S1
      // before S2) — keeps the prior load-balancing behaviour while
      // still respecting the prereq floor.
      candidates.sort((a, b) => {
        const fa = fill[yi]?.[a.si] ?? 0
        const fb = fill[yi]?.[b.si] ?? 0
        if (fa !== fb) return fa - fb
        return a.rank - b.rank
      })
      for (const { si, rank } of candidates) {
        if ((fill[yi]?.[si] ?? 0) + weight <= capOf(yi, si)) {
          placements.push({ code, yearIndex: yi, slotIndex: si })
          const row = (fill[yi] ??= [0, 0])
          row[si] = (row[si] ?? 0) + weight
          placedAt.set(code, {
            yearIndex: yi,
            kind: rank === 0 ? "S1" : "S2",
          })
          placed = true
          break
        }
      }
    }
  }

  return { placements, skipped }
}

function levelOf(level: string | null | undefined): number {
  if (!level) return 9
  const m = /Level\s+(\d+)/i.exec(level)
  return m ? Number(m[1]) : 9
}

function yearForLevel(
  level: string | null | undefined,
  currentYears: number
): number {
  const n = levelOf(level)
  if (n <= 1) return 0
  if (n === 2) return 1
  if (n === 3) return 2
  return Math.min(Math.max(currentYears - 1, 2), n - 1)
}

/**
 * "Year-blocking" = the unit, while planned, occupies the student's
 * entire calendar year. Two flavours:
 *   - genuine full-year offerings (FY teaching period, no S1/S2).
 *   - IBL placements & equivalents: credit-bearing (≥ 12 CP) but every
 *     offering classifies as `OTHER` (Term N, Trimester N, …). These
 *     run full-time across multiple months and exclude concurrent
 *     S1/S2 study just as effectively as a tagged-FY unit.
 */
function isYearBlocking(
  offers: readonly PlannerOffering[],
  cp: number
): boolean {
  if (offers.length === 0) return false
  const hasFY = offers.some((o) => o.periodKind === "FULL_YEAR")
  const hasS1 = offers.some((o) => o.periodKind === "S1")
  const hasS2 = offers.some((o) => o.periodKind === "S2")
  if (hasFY && !hasS1 && !hasS2) return true
  const allOther = offers.every((o) => o.periodKind === "OTHER")
  return allOther && cp >= 12
}

/**
 * Slot-fill weight contributed by a unit code. Units with credit
 * points contribute `round(cp/6)` weight (a standard 6 CP unit is 1,
 * a 12 CP is 2, an 18 CP is 3). A 0 CP companion (IBL onboarding,
 * IBL seminar) contributes 0 — these are the "in addition to any
 * prescribed coursework" units the handbook synopses explicitly
 * describe.
 *
 * When the unit is booked into both S1 and S2 (year-long flavour),
 * the weight is split across the two halves: an 18 CP IBL placement
 * consumes ~2 of the 4-unit-equivalent slot capacity in each
 * semester, leaving room for the 0 CP companion plus maybe one
 * stretch unit — which matches the realistic IBL year.
 */
function perSlotWeight(
  code: string,
  units: ReadonlyMap<string, PlannerUnit>,
  _offerings: ReadonlyMap<string, PlannerOffering[]>,
  splitAcrossYear: boolean
): number {
  const cp = units.get(code)?.creditPoints
  if (cp == null || cp <= 0) return 0
  const base = Math.round(cp / STANDARD_CP)
  if (!splitAcrossYear) return Math.max(1, base)
  // Split across two halves: half the weight per half-year, rounded
  // up so a 6 CP FY still costs at least 1 in each half.
  return Math.max(1, Math.ceil(base / 2))
}

/**
 * Is this already-planned code being held in a year-blocking position?
 * Used when seeding `fill` from the existing plan so the weight we
 * subtract from the slot cap matches what we'd assign on placement.
 */
function isAcrossYear(yi: number, code: string, state: PlannerState): boolean {
  const year = state.years[yi]
  if (!year) return false
  let count = 0
  for (const s of year.slots) if (s.unitCodes.includes(code)) count++
  return count >= 2
}

/**
 * For each code with a `prerequisite` rule, collect the prerequisite
 * unit codes referenced anywhere in the rule tree — but only keep
 * edges that point to codes inside `known` (the queue plus already-
 * planned codes). Edges to codes we have no information about (e.g.
 * a prereq the student is expected to have completed before this
 * planner instance) are dropped: they're not actionable for ordering.
 *
 * OR groups: a unit listing "(FIT1045 OR FIT1053) AND ..." has both
 * FIT1045 and FIT1053 in `requisite_refs`. Treating *every* referenced
 * code as an ordering edge is correct here — if both alternatives are
 * being loaded together that's a data-quality issue upstream; if only
 * one is in the queue, only that edge exists, which is exactly right.
 */
function buildPrereqEdges(
  requisites: ReadonlyMap<string, RequisiteBlock[]> | undefined,
  known: ReadonlySet<string>
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  if (!requisites) return out
  for (const code of known) {
    const blocks = requisites.get(code)
    if (!blocks) continue
    const edges = new Set<string>()
    for (const block of blocks) {
      if (block.requisiteType !== "prerequisite" || !block.rule) continue
      for (const ref of collectRuleCodes(block.rule)) {
        if (ref !== code && known.has(ref)) edges.add(ref)
      }
    }
    if (edges.size > 0) out.set(code, edges)
  }
  return out
}

function collectRuleCodes(rule: RequisiteRule): Set<string> {
  const out = new Set<string>()
  const walk = (
    nodes: readonly (
      | { academic_item_code?: string }
      | { containers?: unknown; relationships?: unknown }
    )[]
  ): void => {
    for (const node of nodes) {
      if (
        "academic_item_code" in node &&
        typeof node.academic_item_code === "string"
      ) {
        out.add(node.academic_item_code)
        continue
      }
      const containers = (node as { containers?: unknown }).containers
      if (Array.isArray(containers)) walk(containers as never)
      const relationships = (node as { relationships?: unknown }).relationships
      if (Array.isArray(relationships)) walk(relationships as never)
    }
  }
  walk(rule)
  return out
}

/**
 * Longest path from each node to any sink in the prereq DAG, with cycle
 * protection — the depth is what feeds the queue tiebreak. Cycles in
 * handbook data are rare but real (e.g. mutual prohibitions occasionally
 * mis-classified upstream); the seen-set degrades them to depth 0 rather
 * than crashing.
 */
function computeDepths(
  nodes: readonly string[],
  edges: ReadonlyMap<string, ReadonlySet<string>>
): Map<string, number> {
  const memo = new Map<string, number>()
  const visit = (n: string, stack: Set<string>): number => {
    const m = memo.get(n)
    if (m !== undefined) return m
    if (stack.has(n)) return 0
    stack.add(n)
    let best = 0
    for (const p of edges.get(n) ?? []) {
      best = Math.max(best, visit(p, stack) + 1)
    }
    stack.delete(n)
    memo.set(n, best)
    return best
  }
  for (const n of nodes) visit(n, new Set())
  return memo
}
