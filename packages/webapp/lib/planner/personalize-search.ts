import { evaluateRequisiteTree } from "./requisites.ts"
import type {
  PeriodKind,
  PlannerCourseWithAoS,
  PlannerOffering,
  PlannerState,
  PlannerUnit,
  RequisiteBlock,
  RequisiteRule,
} from "./types.ts"
import { isOfferedInPeriod } from "./validation.ts"

/**
 * Per-plan precomputed signals — derived once when the plan changes,
 * then consumed by `personalScore` for every candidate. Everything in
 * here is cheap O(units in plan) and avoids re-walking the AoS /
 * requisite trees on every keystroke.
 */
export interface PersonalSignals {
  /** Codes placed anywhere in the plan. */
  placed: ReadonlySet<string>
  /**
   * Soft "this unit belongs to your course" score. Course core = 1.0,
   * major / extended-major / specialisation = 1.0, minor = 0.7, elective
   * = 0.5, other = 0.4. Codes outside the course graph get 0.
   */
  aosWeight: ReadonlyMap<string, number>
  /**
   * Codes that, if added, would chip away at an unmet RequirementGroup
   * — i.e. groups where placed < required. A unit can satisfy more than
   * one group but we only need set membership for scoring.
   */
  fillsGap: ReadonlySet<string>
  /**
   * Codes the student can't take given units already on their plan
   * (i.e. referenced by a placed unit's prohibition block). Hard
   * demote.
   */
  prohibitedByPlaced: ReadonlySet<string>
  /**
   * One-hop neighbours of placed units in the requisite graph — codes
   * that appear in a placed unit's prereq or coreq tree. Useful boost
   * for "this is in the same chain as what you're already doing".
   */
  prereqOfPlaced: ReadonlySet<string>
}

/** Per-slot derived context — chronology + period. */
export interface SlotContext {
  yearIndex: number
  slotIndex: number
  slotKind: PeriodKind | undefined
  /** Codes completed strictly before this slot. */
  completedBefore: ReadonlySet<string>
  /** Codes already in this slot. */
  concurrentWith: ReadonlySet<string>
  /** Expected handbook year for the slot (courseYear + yearIndex). */
  expectedHandbookYear: string | undefined
}

/** Feature-by-feature breakdown returned with each candidate. */
export interface ScoreBreakdown {
  text: number
  periodFit: number
  aos: number
  fillsGap: number
  prereqReady: number
  levelMatch: number
  prereqOfPlaced: number
  placed: number
  prohibited: number
  total: number
}

export interface RankedCandidate {
  unit: PlannerUnit
  score: ScoreBreakdown
}

/**
 * Linear weights for each feature. Tuned by hand to start — every
 * feature is normalised to [0,1] (or {0,1}) so weights read as
 * "boost magnitude". The two negative entries are large enough to
 * dominate any positive sum (hard kill). Once we have enough
 * unit_added click-throughs in PostHog these can be learned.
 */
const WEIGHTS = {
  text: 1.5,
  periodFit: 4.0,
  aos: 3.5,
  fillsGap: 3.0,
  prereqReady: 2.0,
  levelMatch: 1.5,
  prereqOfPlaced: 1.0,
  placed: -100,
  prohibited: -100,
} as const

function aosKindWeight(kind: string): number {
  switch (kind) {
    case "major":
    case "extended_major":
    case "specialisation":
      return 1.0
    case "minor":
      return 0.7
    case "elective":
      return 0.5
    default:
      return 0.4
  }
}

function collectLeafCodes(rule: RequisiteRule | null | undefined): string[] {
  // Re-use the existing tree walker by evaluating against an empty
  // completed set — every referenced leaf is reported back regardless
  // of satisfaction.
  if (!rule) return []
  return evaluateRequisiteTree(rule, new Set<string>()).referencedCodes
}

export function buildPersonalSignals(
  state: PlannerState,
  course: PlannerCourseWithAoS | null,
  requisitesByCode: ReadonlyMap<string, RequisiteBlock[]>
): PersonalSignals {
  const placed = new Set<string>()
  for (const y of state.years)
    for (const s of y.slots) for (const c of s.unitCodes) placed.add(c)

  const aosWeight = new Map<string, number>()
  if (course) {
    for (const cu of course.courseUnits) {
      aosWeight.set(cu.code, Math.max(aosWeight.get(cu.code) ?? 0, 1.0))
    }
    for (const aos of course.areasOfStudy) {
      const w = aosKindWeight(aos.kind)
      for (const u of aos.units) {
        aosWeight.set(u.code, Math.max(aosWeight.get(u.code) ?? 0, w))
      }
    }
  }

  const fillsGap = new Set<string>()
  if (course) {
    const groupLists = [
      course.courseRequirements,
      ...course.areasOfStudy.map((a) => a.requirements),
    ]
    for (const groups of groupLists) {
      for (const g of groups) {
        let placedInGroup = 0
        for (const code of g.options) if (placed.has(code)) placedInGroup++
        if (placedInGroup >= g.required) continue
        for (const code of g.options) if (!placed.has(code)) fillsGap.add(code)
      }
    }
  }

  const prohibitedByPlaced = new Set<string>()
  const prereqOfPlaced = new Set<string>()
  for (const code of placed) {
    const blocks = requisitesByCode.get(code) ?? []
    for (const block of blocks) {
      const leaves = collectLeafCodes(block.rule)
      if (block.requisiteType === "prohibition") {
        for (const c of leaves) prohibitedByPlaced.add(c)
      } else if (
        block.requisiteType === "prerequisite" ||
        block.requisiteType === "corequisite"
      ) {
        for (const c of leaves) prereqOfPlaced.add(c)
      }
    }
  }

  return { placed, aosWeight, fillsGap, prohibitedByPlaced, prereqOfPlaced }
}

export function slotContextFor(
  state: PlannerState,
  yearIndex: number,
  slotIndex: number
): SlotContext {
  const slot = state.years[yearIndex]?.slots[slotIndex]
  const completed = new Set<string>()
  for (let y = 0; y <= yearIndex; y++) {
    const year = state.years[y]
    if (!year) continue
    for (let s = 0; s < year.slots.length; s++) {
      if (y === yearIndex && s >= slotIndex) break
      for (const c of year.slots[s].unitCodes) completed.add(c)
    }
  }
  const concurrent = slot ? new Set(slot.unitCodes) : new Set<string>()
  const courseYearNum = Number(state.courseYear)
  const expectedHandbookYear = Number.isFinite(courseYearNum)
    ? String(courseYearNum + yearIndex)
    : undefined
  return {
    yearIndex,
    slotIndex,
    slotKind: slot?.kind,
    completedBefore: completed,
    concurrentWith: concurrent,
    expectedHandbookYear,
  }
}

/**
 * Extract the leading digit from a level string like "Level 3" or
 * "Postgraduate Level 4". Returns null when no digit is present.
 */
function extractLevelDigit(level: string | null | undefined): number | null {
  if (!level) return null
  const m = level.match(/\d/)
  return m ? Number(m[0]) : null
}

export function personalScore(args: {
  unit: PlannerUnit
  offerings: readonly PlannerOffering[]
  requisites: readonly RequisiteBlock[]
  signals: PersonalSignals
  slot: SlotContext
  /** Server-side text-match rank (0 = best). Undefined for non-search candidates. */
  textRank?: number
  /** Total candidates in the pool; used to normalise textRank. */
  totalCandidates?: number
}): ScoreBreakdown {
  const { unit, offerings, requisites, signals, slot } = args

  const total = args.totalCandidates ?? 0
  const rank = args.textRank
  const text =
    rank === undefined || total <= 1 ? 0 : 1 - rank / Math.max(1, total - 1)

  const periodFit =
    slot.slotKind && isOfferedInPeriod([...offerings], slot.slotKind) ? 1 : 0

  const aos = signals.aosWeight.get(unit.code) ?? 0
  const fillsGap = signals.fillsGap.has(unit.code) ? 1 : 0

  let prereqReady = 1
  for (const block of requisites) {
    if (block.requisiteType !== "prerequisite") continue
    if (!block.rule || block.rule.length === 0) continue
    const res = evaluateRequisiteTree(block.rule, slot.completedBefore)
    if (!res.satisfied) {
      prereqReady = 0
      break
    }
  }

  // levelMatch — Monash level digits 1/2/3 ≈ study-year index 0/1/2.
  // 4/5 only really applies to honours/postgrad which our 3-year BIT
  // doesn't index cleanly; we treat farther distances as 0.
  let levelMatch = 0
  const lvl = extractLevelDigit(unit.level)
  if (lvl !== null) {
    const distance = Math.abs(lvl - (slot.yearIndex + 1))
    levelMatch = Math.max(0, 1 - distance / 3)
  }

  const prereqOfPlaced = signals.prereqOfPlaced.has(unit.code) ? 1 : 0

  // Hard kills — multiplied by very large negative weights so any
  // positive feature combination still places these last. Returned as
  // separate features (not as a sentinel return) so consumers can show
  // why something dropped if they want.
  const placed = signals.placed.has(unit.code) ? 1 : 0
  const prohibited = signals.prohibitedByPlaced.has(unit.code) ? 1 : 0

  const totalScore =
    WEIGHTS.text * text +
    WEIGHTS.periodFit * periodFit +
    WEIGHTS.aos * aos +
    WEIGHTS.fillsGap * fillsGap +
    WEIGHTS.prereqReady * prereqReady +
    WEIGHTS.levelMatch * levelMatch +
    WEIGHTS.prereqOfPlaced * prereqOfPlaced +
    WEIGHTS.placed * placed +
    WEIGHTS.prohibited * prohibited

  return {
    text,
    periodFit,
    aos,
    fillsGap,
    prereqReady,
    levelMatch,
    prereqOfPlaced,
    placed,
    prohibited,
    total: totalScore,
  }
}

export function rankCandidates(
  candidates: readonly PlannerUnit[],
  args: {
    signals: PersonalSignals
    slot: SlotContext
    offeringsByCode: ReadonlyMap<string, readonly PlannerOffering[]>
    requisitesByCode: ReadonlyMap<string, readonly RequisiteBlock[]>
    /** Optional server-side text rank per code. */
    rankByCode?: ReadonlyMap<string, number>
  }
): RankedCandidate[] {
  const total = candidates.length
  return candidates
    .map((unit) => {
      const score = personalScore({
        unit,
        offerings: args.offeringsByCode.get(unit.code) ?? [],
        requisites: args.requisitesByCode.get(unit.code) ?? [],
        signals: args.signals,
        slot: args.slot,
        textRank: args.rankByCode?.get(unit.code),
        totalCandidates: total,
      })
      return { unit, score }
    })
    .sort((a, b) => b.score.total - a.score.total)
}

/**
 * Identify the top-contributing features for a single score — useful
 * for the click-through PostHog event so we can later learn weights
 * from the features that actually mattered. Returns at most three
 * non-zero feature names ordered by their weighted contribution.
 */
export function topFeatures(score: ScoreBreakdown): string[] {
  const contribs: { name: string; v: number }[] = [
    { name: "text", v: WEIGHTS.text * score.text },
    { name: "periodFit", v: WEIGHTS.periodFit * score.periodFit },
    { name: "aos", v: WEIGHTS.aos * score.aos },
    { name: "fillsGap", v: WEIGHTS.fillsGap * score.fillsGap },
    { name: "prereqReady", v: WEIGHTS.prereqReady * score.prereqReady },
    { name: "levelMatch", v: WEIGHTS.levelMatch * score.levelMatch },
    {
      name: "prereqOfPlaced",
      v: WEIGHTS.prereqOfPlaced * score.prereqOfPlaced,
    },
  ]
  return contribs
    .filter((c) => c.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
    .map((c) => c.name)
}
