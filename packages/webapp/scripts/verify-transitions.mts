/**
 * Checks the faculty transition lists against the ingested handbooks.
 *
 *   pnpm --filter webapp verify:transitions
 *
 * Flags a handbook offering after a unit's final offering, a
 * replacement no handbook has, and a new unit whose first offering the
 * handbook already lists. The planner lets the handbook win, so each
 * finding means the list or the handbook is wrong.
 *
 * Reads only. Requires DATABASE_URL from the repo-root .env.
 */
import { DATABASE_URL } from "@monmap/db/env"
import postgres from "postgres"

import { classifyTeachingPeriod } from "../lib/planner/teaching-period.ts"
import { afterLastOffering, TRANSITIONS } from "../lib/planner/transitions.ts"

const sql = postgres(DATABASE_URL)
const units = [...TRANSITIONS.byCode.values()].map((e) => e.unit)
const findings: string[] = []

const offerings = await sql<
  { year: string; unit_code: string; teaching_period: string | null }[]
>`
  SELECT DISTINCT year, unit_code, teaching_period FROM unit_offerings
  WHERE offered AND unit_code = ANY(${units.map((u) => u.code)})`

for (const unit of units) {
  const own = offerings.filter((o) => o.unit_code === unit.code)
  const last = unit.lastOffered

  if (last) {
    for (const o of own) {
      const kind = classifyTeachingPeriod(o.teaching_period)

      if (afterLastOffering(last, kind, Number(o.year)))
        findings.push(
          `${unit.code}: the ${o.year} handbook runs it in ${o.teaching_period}, after its final offering`
        )
    }
  }

  if (unit.firstOffered && own.length > 0) {
    const years = [...new Set(own.map((o) => o.year))].sort().join(", ")
    findings.push(`${unit.code}: the handbook lists offerings in ${years}`)
  }
}

const replacements = [
  ...new Set(units.flatMap((u) => (u.replacedBy ?? []).flat())),
]

const known = new Set(
  (
    await sql<{ code: string }[]>`
      SELECT DISTINCT code FROM units WHERE code = ANY(${replacements})`
  ).map((r) => r.code)
)

for (const code of replacements)
  if (!known.has(code)) findings.push(`${code}: a replacement no handbook has`)

if (findings.length > 0) {
  console.error(`${findings.length} transition finding(s):`)

  for (const f of findings) console.error(`  ${f}`)
  process.exit(1)
}

console.log(`transitions OK (${units.length} units)`)
process.exit(0)
