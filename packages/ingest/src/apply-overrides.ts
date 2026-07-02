/**
 * Re-derive and update `requirement_groups` for ONLY the courses named
 * in `data/curriculum-overrides.json` — the cheap way to ship a new
 * hand fix (edit the JSON, run `pnpm overrides:apply`) without a full
 * recompute or re-ingest.
 *
 *   pnpm overrides:apply           # apply to every matching course row
 *   pnpm overrides:apply --dry-run # print what would change, write nothing
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
  applyCurriculumOverrides,
  courses,
  createDb,
  extractRequirementGroups,
} from "@monmap/db";
import { DATABASE_URL } from "@monmap/db/env";
import { loadCurriculumOverrides } from "./overrides.ts";

const dryRun = process.argv.includes("--dry-run");

const overrides = loadCurriculumOverrides();
const courseCodes = [...new Set(overrides.map((o) => o.course.toUpperCase()))];
console.log(
  `${overrides.length} override(s) covering ${courseCodes.length} course(s): ${courseCodes.join(", ")}`,
);

const db = createDb(DATABASE_URL, {
  pool: { max: 2, idle_timeout: 0, prepare: false },
});

const rows = await db
  .select({
    year: courses.year,
    code: courses.code,
    creditPoints: courses.creditPoints,
    curriculumStructure: courses.curriculumStructure,
  })
  .from(courses)
  .where(
    and(
      inArray(courses.code, courseCodes),
      isNotNull(courses.curriculumStructure),
    ),
  );

let updated = 0;
for (const row of rows) {
  const base = extractRequirementGroups(
    row.curriculumStructure,
    row.creditPoints ?? 0,
  );
  const { groups, applied } = applyCurriculumOverrides(
    row.code,
    row.year,
    base,
    overrides,
  );
  if (applied.length === 0) {
    console.log(`  ${row.code} ${row.year}: no override matched, skipped`);
    continue;
  }
  console.log(
    `  ${row.code} ${row.year}: ${groups.length} group(s) after ${applied.length} override(s)${dryRun ? " [dry-run]" : ""}`,
  );
  if (!dryRun) {
    await db
      .update(courses)
      .set({ requirementGroups: groups })
      .where(and(eq(courses.year, row.year), eq(courses.code, row.code)));
  }
  updated++;
}

console.log(`${dryRun ? "Would update" : "Updated"} ${updated} course rows.`);
process.exit(0);
