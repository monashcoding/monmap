/**
 * Regression harness for `fetchCourseWithAoS` against the live
 * handbook database.
 *
 *   pnpm --filter webapp verify:resolver             # diff vs committed snapshot
 *   pnpm --filter webapp verify:resolver --update    # rewrite the snapshot
 *   pnpm --filter webapp verify:resolver --sweep 2026  # every course resolves +
 *                                                     # picker invariants hold
 *
 * The committed snapshot (`scripts/resolver-snapshot.json`) captures a
 * normalized summary — counts and shapes, not full payloads — for a
 * set of courses chosen because each exercises a distinct resolver
 * path (see CASES). Run this after touching the resolver, an
 * extractor, or after a re-ingest/backfill; an intentional data change
 * (e.g. baking `excluded_aos`) shows up as a reviewable diff you
 * accept with --update.
 *
 * Reads only. Requires DATABASE_URL from the repo-root .env.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { config } from "dotenv"

config({ path: resolve(fileURLToPath(import.meta.url), "../../../../.env") })

const { fetchCourseWithAoS, listCoursesForPicker } =
  await import("../lib/db/queries.ts")
const { computeAosSlotsWithRepeats } = await import(
  "../lib/planner/aos-slots.ts"
)
const { availableCampuses, optionsForCampus } = await import(
  "../lib/planner/campus.ts"
)
const { detectAosOverlaps } = await import("../lib/planner/overlap.ts")

/** Each case exercises a distinct resolver path — keep the reasons. */
const CASES: ReadonlyArray<[code: string, year: string, why: string]> = [
  ["S2004", "2026", "double degree, zero direct links, exclusions prose"],
  ["S2004", "2025", "same, prior year labels differ"],
  ["S2004", "2022", "legacy shape: direct links, no sub-course refs"],
  ["D3002", "2026", "component with no template (missingTemplate)"],
  ["A6039", "2026", "duplicate-title refs are alternatives, not components"],
  ["A6011", "2026", "hybrid: parent group + two real components"],
  ["F2016", "2026", "hybrid: parent groups + single component"],
  ["B2008", "2026", "plain modern double degree"],
  ["C2001", "2026", "single degree with embedded specialisations"],
  ["S2000", "2026", "single degree with many majors"],
  ["E3010", "2026", "engineering double: narrowed AoS, no technical electives"],
  ["E3001", "2026", "same specialisations as a single degree: electives kept"],
  ["L3005", "2026", "cross-component prohibition: BTC1110 vs compulsory LAW2102"],
  ["0047", "2026", "research program: no tree, no data at all"],
  ["C6001", "2026", "groups but zero AoS"],
  ["A2000", "2022", "majors vs extended majors in one container (was inverted)"],
  ["A2000", "2026", "same course, the year Monash split that container"],
]

const snapshotPath = resolve(
  fileURLToPath(import.meta.url),
  "../resolver-snapshot.json"
)

type Summary = Record<string, unknown>

async function summarize(code: string, year: string): Promise<Summary | null> {
  const c = await fetchCourseWithAoS(code, year)
  if (!c) return null
  const byKind: Record<string, number> = {}
  const byComponent: Record<string, number> = {}
  // Requirement groups summed across every AoS. Without this the
  // snapshot only sees which AoS are offered, not what each one
  // demands — so cohort-scoped changes (a double degree shedding its
  // specialisation's technical electives) would drift silently.
  let aosGroups = 0
  let aosGroupOptions = 0
  for (const a of c.areasOfStudy) {
    byKind[a.kind] = (byKind[a.kind] ?? 0) + 1
    const k = a.componentCourseCode ?? a.componentLabel ?? "(course)"
    byComponent[k] = (byComponent[k] ?? 0) + 1
    aosGroups += a.requirements.length
    for (const g of a.requirements) aosGroupOptions += g.options.length
  }
  return {
    title: c.title,
    courseRequirements: c.courseRequirements.length,
    courseUnits: c.courseUnits.length,
    components: c.componentCourses.map((x) => ({
      code: x.courseCode,
      title: x.componentTitle,
      groups: x.courseRequirements.length,
      units: x.courseUnits.length,
      missingTemplate: x.missingTemplate ?? false,
    })),
    aosTotal: c.areasOfStudy.length,
    aosByKind: byKind,
    aosByComponent: byComponent,
    aosGroups,
    aosGroupOptions,
    // Prohibition edges shipped for the reachability cap — drifts if
    // the conflict query or the candidate set changes shape.
    conflictCodes: Object.keys(c.conflicts ?? {}).length,
  }
}

const sweepFlag = process.argv.indexOf("--sweep")
if (sweepFlag !== -1) {
  const year = process.argv[sweepFlag + 1]
  if (!year || !/^\d{4}$/.test(year))
    throw new Error("--sweep requires a 4-digit year")
  const courses = await listCoursesForPicker(null, 10_000, year)
  let ok = 0
  const failed: string[] = []
  for (const { code } of courses) {
    try {
      const c = await fetchCourseWithAoS(code, year)
      if (!c) {
        failed.push(`${code}: null`)
        continue
      }
      ok++
      // Structural invariants of the area-of-study picker, checked for
      // every course rather than the handful in CASES. Each of these
      // was a real defect found by looking at one course; the sweep is
      // what makes the fix a statement about the whole corpus.
      const campuses = availableCampuses(c)
      const slots = computeAosSlotsWithRepeats(c, {})

      for (const s of slots) {
        // A slot with nothing to choose should never be built.
        if (s.options.length === 0)
          failed.push(`${code}: empty slot "${s.label}"`)
        // Nor should a campus choice empty one that had options.
        for (const campus of campuses) {
          if (
            optionsForCampus(s.options, campus, undefined, campuses).length ===
              0 &&
            campuses.length === 1
          )
            failed.push(`${code}: "${s.label}" empties at ${campus}`)
        }
      }

      // Two pickers offering the identical choice are one choice shown
      // twice — E3010's two Computer Science slots look like this but
      // are not (36cp discipline vs a 12-18cp project).
      for (let i = 0; i < slots.length; i++)
        for (let j = i + 1; j < slots.length; j++) {
          const a = slots[i]!.options.map((o) => o.code).sort().join(",")
          const b = slots[j]!.options.map((o) => o.code).sort().join(",")
          if (a && a === b)
            failed.push(
              `${code}: duplicate slots "${slots[i]!.label}" / "${slots[j]!.label}"`
            )
        }

      // An extended major subsumes the major of the same name, so the
      // pair must always be caught by the redundancy warning.
      const majors = c.areasOfStudy.filter((a) => a.kind === "major")
      for (const e of c.areasOfStudy.filter(
        (a) => a.kind === "extended_major"
      )) {
        const m = majors.find(
          (x) => x.title.trim().toLowerCase() === e.title.trim().toLowerCase()
        )
        if (!m) continue
        const warned = detectAosOverlaps(
          [
            { slotKey: "major", label: "Major", aos: m },
            { slotKey: "extendedMajor", label: "Extended major", aos: e },
          ],
          new Set()
        ).some((o) => /already includes/.test(o.message))
        if (!warned)
          failed.push(`${code}: unflagged ${m.code}/${e.code} "${e.title}"`)
      }
    } catch (e) {
      failed.push(`${code}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  console.log(
    `sweep ${year}: ${ok}/${courses.length} resolve, picker invariants ${failed.length === 0 ? "OK" : "FAILED"}`
  )
  if (failed.length > 0) {
    console.error(failed.join("\n"))
    process.exit(1)
  }
  process.exit(0)
}

const current: Record<string, Summary | null> = {}
for (const [code, year] of CASES) {
  current[`${code}@${year}`] = await summarize(code, year)
}

if (process.argv.includes("--update")) {
  writeFileSync(snapshotPath, JSON.stringify(current, null, 2) + "\n")
  console.log(`snapshot updated: ${snapshotPath}`)
  process.exit(0)
}

const expected = JSON.parse(readFileSync(snapshotPath, "utf8"))
const problems: string[] = []
for (const key of Object.keys({ ...expected, ...current })) {
  const a = JSON.stringify(expected[key], null, 2)
  const b = JSON.stringify(current[key], null, 2)
  if (a !== b)
    problems.push(`${key} changed:\n--- expected\n${a}\n+++ actual\n${b}`)
}
if (problems.length > 0) {
  console.error(problems.join("\n\n"))
  console.error(
    `\n${problems.length} case(s) drifted. If intentional (extractor change + backfill, re-ingest), re-run with --update and commit the diff.`
  )
  process.exit(1)
}
console.log(`resolver snapshot OK (${Object.keys(current).length} cases)`)
process.exit(0)
