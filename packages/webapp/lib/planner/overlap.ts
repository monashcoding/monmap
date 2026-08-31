import type { PickedAosEntry } from "./aos-slots.ts"
import type { PlannerAreaOfStudy } from "./types.ts"

/**
 * Shared units between two areas of study a student holds at once.
 *
 * `summarizeAoSProgress` runs once per AoS with no cross-AoS
 * awareness, which is harmless while a student holds one pick per
 * slot. The moment they hold two majors, a unit listed by both counts
 * fully toward each, while `summarizePlan` counts its credit points
 * once — so both majors race toward 100% while the credit ring lags,
 * and the plan claims a completion Monash would reject.
 *
 * Monash caps this explicitly. The rule is stated by 27-28 courses in
 * every year from 2023 and 11 a year before that, across Business,
 * Arts and Science, in near-identical wording:
 *
 *   B2042 — "No more than two units can contribute towards two
 *   majors, or a major and a minor, in the same course (including a
 *   double degree course)."
 *
 *   B2028 — "…you may complete a second major with no more than two
 *   units contributing towards both of your chosen majors…"
 *
 * We surface overlap rather than netting it out of one side: which
 * major would "lose" the unit is arbitrary, and the student would
 * watch progress fall on an AoS they never touched.
 */
export const MAX_SHARED_UNITS_BETWEEN_AOS = 2

/**
 * A stricter rule that some courses add:
 *
 *   A2000 — "The same credit points cannot be credited towards more
 *   than one minor."
 *
 * Off by default, and deliberately so: it appears only from 2023 and
 * only in 4-6 courses a year, so applying it everywhere would fire on
 * 2020-2022 plans against a rule that did not exist yet. Turning it on
 * needs the course's own prose, which is not baked into the payload —
 * that is the follow-up, not a reason to hard-code it on.
 */
export interface OverlapOptions {
  minorsMayNotShareUnits?: boolean
}

export interface AosOverlap {
  /** The two AoS involved, in picker order. */
  a: PlannerAreaOfStudy
  b: PlannerAreaOfStudy
  /** Units the student has actually placed that count toward both. */
  sharedCodes: string[]
  /**
   * "note" — sharing within what the handbook allows.
   * "warning" — over the cap, or two minors sharing at all.
   */
  severity: "note" | "warning"
  message: string
}

/** Every unit the AoS lists, as a set. */
function membership(aos: PlannerAreaOfStudy): Set<string> {
  const out = new Set<string>()
  for (const u of aos.units) out.add(u.code)
  for (const g of aos.requirements) for (const c of g.options) out.add(c)
  return out
}

function label(aos: PlannerAreaOfStudy): string {
  return aos.title || aos.code
}

/**
 * Pairwise overlap across the student's picks, counting only units
 * they have actually placed — listing the same unit as an *option* in
 * two majors is not double counting until one is taken.
 */
export function detectAosOverlaps(
  picked: readonly PickedAosEntry[],
  plannedCodes: ReadonlySet<string>,
  options: OverlapOptions = {}
): AosOverlap[] {
  const out: AosOverlap[] = []
  // De-duplicate by code: the same AoS reachable through two slots is
  // one area of study, not an overlapping pair with itself.
  const seen = new Set<string>()
  const entries: PlannerAreaOfStudy[] = []
  for (const p of picked) {
    if (seen.has(p.aos.code)) continue
    seen.add(p.aos.code)
    entries.push(p.aos)
  }

  for (let i = 0; i < entries.length; i++) {
    const a = entries[i]!
    const aMembers = membership(a)
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j]!
      const shared: string[] = []
      for (const code of membership(b))
        if (aMembers.has(code) && plannedCodes.has(code)) shared.push(code)
      if (shared.length === 0) continue
      shared.sort()

      const bothMinors = a.kind === "minor" && b.kind === "minor"
      const minorBreach =
        bothMinors && (options.minorsMayNotShareUnits ?? false)
      const overCap = shared.length > MAX_SHARED_UNITS_BETWEEN_AOS
      const severity: AosOverlap["severity"] =
        overCap || minorBreach ? "warning" : "note"

      out.push({
        a,
        b,
        sharedCodes: shared,
        severity,
        message: minorBreach
          ? `${formatCodes(shared)} counts toward both ${label(a)} and ${label(b)}. The same credit points cannot count toward more than one minor.`
          : overCap
            ? `${formatCodes(shared)} count toward both ${label(a)} and ${label(b)}. Monash allows at most ${MAX_SHARED_UNITS_BETWEEN_AOS} units to be shared.`
            : `${formatCodes(shared)} ${shared.length === 1 ? "counts" : "count"} toward both ${label(a)} and ${label(b)}.`,
      })
    }
  }
  return out
}

function formatCodes(codes: readonly string[]): string {
  if (codes.length === 1) return codes[0]!
  return `${codes.slice(0, -1).join(", ")} and ${codes[codes.length - 1]}`
}
