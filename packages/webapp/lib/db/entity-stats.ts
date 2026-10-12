/**
 * The popularity snapshot behind the /search sorts: how many students
 * plan each entity, how many people view its page, and how many
 * courses and areas of study make a unit core. See the comment above
 * `entityStats` in packages/db for the privacy rules.
 *
 * Any server rebuilds the snapshot when it is a day old. A Postgres
 * advisory lock lets one server run it at a time, and `job_run` tells
 * the others it is done.
 */
import { sql, type SQL } from "drizzle-orm"

import { getDb } from "./client.ts"
import type { EntityKind } from "../handbook/links.ts"
import { viewDay } from "../views/visitor.ts"

/** Plan counts under this are stored as 0 and never shown. */
export const MIN_PLANNERS = 5
/** Days of daily unique views that count toward `views`. */
export const VIEW_WINDOW_DAYS = 90

const JOB = "entity_stats"
const STALE_MS = 24 * 60 * 60 * 1000
/** How often one process asks the database whether a rebuild is due. */
const CHECK_MS = 60 * 60 * 1000

const ENTITY_TABLE: Record<EntityKind, SQL> = {
  unit: sql`units`,
  course: sql`courses`,
  aos: sql`areas_of_study`,
}

/**
 * Record one page view. Only codes in the handbook count, and a
 * visitor counts once per page per day.
 */
export async function recordView(
  kind: EntityKind,
  code: string,
  day: string,
  visitor: string
): Promise<void> {
  await getDb().execute(sql`
    INSERT INTO entity_view (day, kind, code, visitor)
    SELECT ${day}::date, ${kind}, ${code}, ${visitor}
    WHERE EXISTS (SELECT 1 FROM ${ENTITY_TABLE[kind]} WHERE code = ${code})
    ON CONFLICT DO NOTHING
  `)
}

/**
 * Rebuild the snapshot unless another server holds the lock or rebuilt
 * it less than a day ago. Returns true when this call rebuilt it.
 */
export async function refreshEntityStats(force = false): Promise<boolean> {
  const today = viewDay()
  return getDb().transaction(async (tx) => {
    const run = async <T>(q: SQL) => (await tx.execute(q)) as unknown as T[]

    const [lock] = await run<{ ok: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(hashtext(${JOB})) AS ok`
    )
    if (!lock?.ok) return false
    if (!force) {
      const [last] = await run<{ fresh: boolean }>(sql`
        SELECT finished_at > now() - make_interval(secs => ${STALE_MS / 1000}) AS fresh
        FROM job_run WHERE name = ${JOB}
      `)
      if (last?.fresh) return false
    }

    // Finished days become daily counts, and their visitor keys go.
    await run(sql`
      INSERT INTO entity_view_daily (day, kind, code, viewers)
      SELECT day, kind, code, count(*)::int FROM entity_view
      WHERE day < ${today}::date GROUP BY day, kind, code
      ON CONFLICT (day, kind, code)
        DO UPDATE SET viewers = entity_view_daily.viewers + excluded.viewers
    `)
    await run(sql`DELETE FROM entity_view WHERE day < ${today}::date`)
    await run(sql`
      DELETE FROM entity_view_daily
      WHERE day < ${today}::date - ${VIEW_WINDOW_DAYS}::int
    `)

    // Plan state is user input, so codes are trimmed and upper-cased.
    // A code planned by fewer than MIN_PLANNERS users never leaves the
    // planners CTE.
    await run(sql`DELETE FROM entity_stats`)
    await run(sql`
      INSERT INTO entity_stats (kind, code, planners, views)
      WITH planned AS (
        SELECT DISTINCT 'unit'::review_entity_kind AS kind,
          upper(trim(c)) AS code, p.user_id
        FROM user_plan p,
          jsonb_array_elements(${arrayOf(sql`p.state->'years'`)}) y,
          jsonb_array_elements(${arrayOf(sql`y->'slots'`)}) s,
          jsonb_array_elements_text(${arrayOf(sql`s->'unitCodes'`)}) c
        UNION
        SELECT 'course', upper(trim(p.state->>'courseCode')), p.user_id
        FROM user_plan p
        WHERE coalesce(trim(p.state->>'courseCode'), '') <> ''
        UNION
        SELECT 'aos', upper(trim(a.code)), p.user_id
        FROM user_plan p,
          jsonb_each_text(CASE WHEN jsonb_typeof(p.state->'selectedAos') = 'object'
            THEN p.state->'selectedAos' ELSE '{}' END) a(slot, code)
        WHERE coalesce(trim(a.code), '') <> ''
      ),
      planners AS (
        SELECT kind, code, count(*)::int AS n FROM planned
        GROUP BY kind, code HAVING count(*) >= ${MIN_PLANNERS}
      ),
      views AS (
        SELECT kind, code, sum(viewers)::int AS n FROM entity_view_daily
        GROUP BY kind, code
      )
      SELECT coalesce(p.kind, v.kind), coalesce(p.code, v.code),
        coalesce(p.n, 0), coalesce(v.n, 0)
      FROM planners p FULL JOIN views v ON v.kind = p.kind AND v.code = p.code
    `)

    // A unit is core in a course when a mandatory requirement group
    // names it (groupIsMandatory in packages/db/src/curriculum.ts), and
    // in an area of study when it is under a "Core units" heading.
    await run(sql`DELETE FROM unit_core`)
    await run(sql`
      INSERT INTO unit_core (year, unit_code, sources)
      SELECT year, code, count(*)::int FROM (
        SELECT c.year, o AS code, 'course:' || c.code AS source
        FROM courses c,
          jsonb_array_elements(coalesce(c.requirement_groups, '[]')) g,
          jsonb_array_elements_text(g->'options') o
        WHERE coalesce((g->>'autoLoad')::boolean,
          (g->>'required')::int = jsonb_array_length(g->'options'))
        UNION
        SELECT aos_year, unit_code, 'aos:' || aos_code
        FROM area_of_study_units
        WHERE grouping ~* '^(part [a-z]\\. )?core (units|studies)$'
      ) s
      GROUP BY year, code
    `)

    await run(sql`
      INSERT INTO job_run (name, finished_at) VALUES (${JOB}, now())
      ON CONFLICT (name) DO UPDATE SET finished_at = excluded.finished_at
    `)
    return true
  })
}

/** `value` when it is a JSON array, else an empty one. */
function arrayOf(value: SQL): SQL {
  return sql`(CASE WHEN jsonb_typeof(${value}) = 'array' THEN ${value} ELSE '[]' END)`
}

let nextCheck = 0

/**
 * Start a rebuild in the background when the snapshot may be a day
 * old. It asks the database at most once an hour per process, and a
 * failure waits for the next check.
 */
export function refreshEntityStatsIfStale(): void {
  if (Date.now() < nextCheck) return
  nextCheck = Date.now() + CHECK_MS
  refreshEntityStats().catch((err) => {
    console.error("entity_stats refresh failed", err)
  })
}
