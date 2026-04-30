import {
  slotCapacity,
  type PeriodKind,
  type PlannerOffering,
  type PlannerState,
  type PlannerUnit,
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

export function distribute(args: {
  codes: readonly string[]
  units: ReadonlyMap<string, PlannerUnit>
  offerings: ReadonlyMap<string, PlannerOffering[]>
  state: PlannerState
}): DistributeResult {
  const { codes, units, offerings, state } = args

  const planned = new Set(
    state.years.flatMap((y) => y.slots.flatMap((s) => s.unitCodes))
  )

  const skipped: string[] = []
  const queue: string[] = []
  for (const c of new Set(codes)) {
    if (planned.has(c)) skipped.push(c)
    else queue.push(c)
  }
  queue.sort(
    (a, b) => levelOf(units.get(a)?.level) - levelOf(units.get(b)?.level)
  )

  const fill: number[][] = state.years.map((y) =>
    y.slots.map((s) => s.unitCodes.length)
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

  const placements: Placement[] = []
  const maxYears = state.years.length + MAX_OVERFLOW_YEARS

  for (const code of queue) {
    const unit = units.get(code)
    const targetYear = yearForLevel(unit?.level, state.years.length)
    const offers = offerings.get(code) ?? []
    const hasOfferings = offers.length > 0
    const offersS1 = offers.some((o) => o.periodKind === "S1")
    const offersS2 = offers.some((o) => o.periodKind === "S2")
    const offersFY = offers.some((o) => o.periodKind === "FULL_YEAR")
    // True FY: only available as a year-long unit, no S1/S2 alternative.
    const isFullYear = offersFY && !offersS1 && !offersS2

    if (isFullYear) {
      let placed = false
      for (let yi = targetYear; yi < maxYears && !placed; yi++) {
        ensureYear(yi)
        const s1 = slotIdx(yi, "S1")
        const s2 = slotIdx(yi, "S2")
        if (s1 < 0 || s2 < 0) continue
        // Need room in BOTH semesters — otherwise the twins can't fit.
        if (
          (fill[yi]?.[s1] ?? 0) < capOf(yi, s1) &&
          (fill[yi]?.[s2] ?? 0) < capOf(yi, s2)
        ) {
          placements.push({ code, yearIndex: yi, slotIndex: s1 })
          placements.push({ code, yearIndex: yi, slotIndex: s2 })
          const row = (fill[yi] ??= [0, 0])
          row[s1] = (row[s1] ?? 0) + 1
          row[s2] = (row[s2] ?? 0) + 1
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

    let placed = false
    for (let yi = targetYear; yi < maxYears && !placed; yi++) {
      ensureYear(yi)
      const s1 = slotIdx(yi, "S1")
      const s2 = slotIdx(yi, "S2")
      const candidates: number[] = []
      if (wantsS1 && s1 >= 0) candidates.push(s1)
      if (wantsS2 && s2 >= 0) candidates.push(s2)
      candidates.sort((a, b) => (fill[yi]?.[a] ?? 0) - (fill[yi]?.[b] ?? 0))
      for (const si of candidates) {
        if ((fill[yi]?.[si] ?? 0) < capOf(yi, si)) {
          placements.push({ code, yearIndex: yi, slotIndex: si })
          const row = (fill[yi] ??= [0, 0])
          row[si] = (row[si] ?? 0) + 1
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
