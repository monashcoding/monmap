/**
 * Corpus health harness — data-integrity checks across every ingested
 * handbook year.
 *
 *   pnpm --filter webapp verify:corpus            # compare vs baseline
 *   pnpm --filter webapp verify:corpus --update   # accept current numbers
 *
 * Complements `verify-resolver.mts`, which pins what the *resolver*
 * builds for a handful of courses. This pins what the *corpus* looks
 * like: counts of rows that are structurally broken or unreachable,
 * per year, derived from the audit in
 * `docs/data-gaps-audit-2026-08.md`.
 *
 * Every metric is "lower is better", so the comparison is deliberately
 * asymmetric: a count going **up** fails (a regression — a re-ingest
 * or extractor change broke something), a count going **down** passes
 * with a note (an improvement you accept with --update). A plain diff
 * would cry wolf every time a fix landed.
 *
 * Known-bad counts are baselined rather than asserted to zero, so the
 * suite is honest about what is currently broken without being red.
 *
 * Reads only. Requires DATABASE_URL from the repo-root .env.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { config } from "dotenv"
import postgres from "postgres"

config({ path: resolve(fileURLToPath(import.meta.url), "../../../../.env") })

const baselinePath = resolve(
  fileURLToPath(import.meta.url),
  "../corpus-baseline.json"
)

const sql = postgres(process.env.DATABASE_URL!)

/**
 * Mirrors `classifyTeachingPeriod`'s prefix set. Kept in SQL rather
 * than importing the classifier so the check runs set-wise in the DB;
 * if the classifier gains a prefix, this must gain it too — the
 * `unplaceableTemplateUnits` count moving is the signal.
 */
const MODELLED_PERIOD = `(
  lower(teaching_period) LIKE 'first semester%' OR lower(teaching_period) LIKE 'second semester%'
  OR lower(teaching_period) LIKE 'summer semester a%' OR lower(teaching_period) LIKE 'summer semester b%'
  OR lower(teaching_period) LIKE 'winter semester%' OR lower(teaching_period) LIKE 'full year%')`

/** Each metric: why it matters, and what a rise would mean. */
const METRICS: ReadonlyArray<{
  key: string
  why: string
  run: (year: string) => Promise<number>
}> = [
  {
    key: "danglingAosUnitCodes",
    why: "a template lists a unit that has no row that year — unaddable",
    run: async (y) => count(await sql`
      SELECT count(*) n FROM area_of_study_units au WHERE au.aos_year=${y}
        AND NOT EXISTS (SELECT 1 FROM units u WHERE u.year=${y} AND u.code=au.unit_code)`),
  },
  {
    key: "brokenCourseAosEdges",
    why: "course offers an area of study with no areas_of_study row",
    run: async (y) => count(await sql`
      SELECT count(*) n FROM course_areas_of_study c WHERE c.course_year=${y}
        AND NOT EXISTS (SELECT 1 FROM areas_of_study a WHERE a.year=c.aos_year AND a.code=c.aos_code)`),
  },
  {
    key: "reachableAosWithNoUnits",
    why: "student can pick this AoS and get an empty panel",
    run: async (y) => count(await sql`
      SELECT count(DISTINCT e.aos_code) n FROM course_areas_of_study e WHERE e.course_year=${y}
        AND NOT EXISTS (SELECT 1 FROM area_of_study_units au
                        WHERE au.aos_year=e.aos_year AND au.aos_code=e.aos_code)`),
  },
  {
    key: "ugCoursesRenderingEmptyPlanner",
    why: "no template, no AoS, no components — a blank grid",
    run: async (y) => count(await sql`
      SELECT count(*) n FROM courses c WHERE c.year=${y} AND c.type LIKE 'UG%'
        AND (c.requirement_groups IS NULL OR jsonb_array_length(c.requirement_groups)=0)
        AND NOT EXISTS (SELECT 1 FROM course_areas_of_study e
                        WHERE e.course_year=c.year AND e.course_code=c.code)
        AND (c.sub_course_refs IS NULL OR jsonb_array_length(c.sub_course_refs)=0)`),
  },
  {
    key: "ugDoublesWithoutComponents",
    why: "double degree resolves to half a degree or less",
    run: async (y) => count(await sql`
      SELECT count(*) n FROM courses WHERE year=${y} AND type='UG double'
        AND (sub_course_refs IS NULL OR jsonb_array_length(sub_course_refs)=0)`),
  },
  {
    key: "danglingComponentRefs",
    why: "sub_course_ref names a course absent that year",
    run: async (y) => count(await sql`
      SELECT count(*) n FROM courses c, jsonb_array_elements(c.sub_course_refs) ref
      WHERE c.year=${y} AND c.sub_course_refs IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM courses x WHERE x.year=c.year AND x.code = ref->>'courseCode')`),
  },
  {
    key: "paddedRequisiteCodes",
    why: "whitespace-padded code matches no unit — an unsatisfiable prereq (see parse.ts collectCodeRefs)",
    run: async (y) => count(await sql`
      SELECT count(*) n FROM requisite_refs
      WHERE year=${y} AND requires_unit_code <> btrim(requires_unit_code)`),
  },
  {
    key: "duplicateCourseAosEdges",
    why: "same (course, AoS) pair linked twice — duplicate picker options",
    run: async (y) => count(await sql`
      SELECT count(*) n FROM (
        SELECT course_code, aos_code FROM course_areas_of_study
        WHERE course_year=${y} GROUP BY 1,2 HAVING count(*)>1) t`),
  },
  {
    key: "templateUnitsWithNoSatisfiablePrereq",
    why: "every prereq code this unit names is absent — a wall the student cannot clear",
    run: async (y) => count(await sql`
      WITH pr AS (
        SELECT rr.unit_code, count(*) AS total,
               count(*) FILTER (WHERE NOT EXISTS (
                 SELECT 1 FROM units u WHERE u.year=${y} AND u.code=rr.requires_unit_code)) AS dangling
        FROM requisite_refs rr WHERE rr.year=${y} AND rr.requisite_type='prerequisite'
        GROUP BY 1)
      SELECT count(*) n FROM pr WHERE pr.dangling = pr.total
        AND EXISTS (SELECT 1 FROM area_of_study_units au
                    WHERE au.aos_year=${y} AND au.unit_code=pr.unit_code)`),
  },
  {
    key: "unplaceableTemplateUnits",
    why: "a template asks for a unit offered only in periods the grid cannot render",
    run: async (y) => count(await sql.unsafe(`
      WITH other_only AS (
        SELECT u.code FROM units u WHERE u.year='${y}'
          AND EXISTS (SELECT 1 FROM unit_offerings o
                      WHERE o.year=u.year AND o.unit_code=u.code AND o.offered)
          AND NOT EXISTS (SELECT 1 FROM unit_offerings o
                          WHERE o.year=u.year AND o.unit_code=u.code AND o.offered AND ${MODELLED_PERIOD}))
      SELECT count(DISTINCT au.unit_code) n FROM area_of_study_units au
      JOIN other_only oo ON oo.code = au.unit_code WHERE au.aos_year='${y}'`)),
  },
  {
    key: "ugCoursesWithNullCreditPoints",
    why: "progress ring silently falls back to a 144-point denominator (progress.ts:117)",
    run: async (y) => count(await sql`
      SELECT count(*) n FROM courses
      WHERE year=${y} AND type LIKE 'UG%' AND (credit_points IS NULL OR credit_points=0)`),
  },
]

function count(rows: Array<Record<string, unknown>>): number {
  return Number(rows[0]!.n)
}

const years = (
  await sql`SELECT DISTINCT year FROM courses ORDER BY year`
).map((r) => String(r.year))

const current: Record<string, Record<string, number>> = {}
for (const y of years) {
  current[y] = {}
  for (const m of METRICS) current[y]![m.key] = await m.run(y)
}
await sql.end()

if (process.argv.includes("--update")) {
  writeFileSync(baselinePath, JSON.stringify(current, null, 2) + "\n")
  console.log(`corpus baseline updated: ${baselinePath}`)
  process.exit(0)
}

const why = new Map(METRICS.map((m) => [m.key, m.why]))
const expected: Record<string, Record<string, number>> = JSON.parse(
  readFileSync(baselinePath, "utf8")
)

const regressions: string[] = []
const improvements: string[] = []
for (const y of Object.keys({ ...expected, ...current })) {
  for (const m of METRICS) {
    const before = expected[y]?.[m.key]
    const after = current[y]?.[m.key]
    if (before === undefined || after === undefined) {
      regressions.push(`${y}.${m.key}: baseline/current missing (new year or metric — run --update)`)
      continue
    }
    if (after > before)
      regressions.push(`${y}.${m.key}: ${before} → ${after}  (${m.why})`)
    else if (after < before) improvements.push(`${y}.${m.key}: ${before} → ${after}`)
  }
}

if (improvements.length > 0) {
  console.log(`${improvements.length} metric(s) improved:`)
  for (const i of improvements) console.log(`  ${i}`)
  console.log("  → re-run with --update to bake these in.\n")
}

if (regressions.length > 0) {
  console.error(`${regressions.length} corpus metric(s) got worse:`)
  for (const r of regressions) console.error(`  ${r}`)
  console.error(
    "\nA rise means a re-ingest, extractor or backfill change broke something. " +
      "Fix it, or accept deliberately with --update."
  )
  process.exit(1)
}

console.log(
  `corpus baseline OK (${years.length} years × ${METRICS.length} metrics)`
)
process.exit(0)
