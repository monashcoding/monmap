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

/**
 * Two picks that are the same discipline in different guises.
 *
 * An extended major *extends* the major of the same name rather than
 * sitting beside it: A2000's PSYCHOL09 (extended) and PSYCHOL07
 * (major) are both titled "Psychology" and list the identical 10
 * units, so holding both is redundant, not a double count. Same for
 * EUROPLAN03/EUROPLAN01.
 *
 * Reported from *membership*, not from placed units — unlike the
 * shared-unit cap below. The redundancy is structural: it is already
 * true the moment both are picked, and waiting for the student to
 * place a unit before saying so would let them build the whole plan on
 * a contradiction.
 */
function sameDiscipline(a: PlannerAreaOfStudy, b: PlannerAreaOfStudy): boolean {
  const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ")
  if (!a.title || !b.title) return false
  if (norm(a.title) !== norm(b.title)) return false
  const kinds = new Set([a.kind, b.kind])
  return kinds.has("major") && kinds.has("extended_major")
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
      // Structural redundancy first: it does not depend on placement,
      // and reporting it as a shared-unit count would understate it.
      if (sameDiscipline(a, b)) {
        const [major, extended] = a.kind === "extended_major" ? [b, a] : [a, b]
        out.push({
          a,
          b,
          sharedCodes: [...membership(a)]
            .filter((c) => membership(b).has(c))
            .sort(),
          severity: "warning",
          message: `The ${label(extended)} extended major already includes the ${label(major)} major — pick one, not both.`,
        })
        continue
      }

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
