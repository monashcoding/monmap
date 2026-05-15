/**
 * Backfill the precomputed curriculum columns added in migration 0006
 * (requirement_groups, embedded_specialisations, sub_course_refs,
 * component_labels) from each row's existing `curriculum_structure`
 * JSONB. Idempotent — only touches rows where every precomputed
 * column is still NULL, so re-running after ingest is a no-op.
 *
 *   pnpm backfill:curriculum
 *
 * Use this instead of a full re-ingest when only the curriculum
 * derivation logic has changed.
 */
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import {
  createDb,
  courses,
  extractComponentLabels,
  extractEmbeddedSpecialisations,
  extractRequirementGroups,
  extractSubCourseRefs,
} from "@monmap/db";
import { DATABASE_URL } from "@monmap/db/env";

const db = createDb(DATABASE_URL, {
  pool: { max: 2, idle_timeout: 0, prepare: false },
});

// Only rows that have a structure to derive from AND haven't been
// backfilled yet. Checking just one precomputed column is enough
// because parseCourse writes all four atomically.
const rows = await db
  .select({
    year: courses.year,
    code: courses.code,
    curriculumStructure: courses.curriculumStructure,
  })
  .from(courses)
  .where(
    and(
      isNotNull(courses.curriculumStructure),
      isNull(courses.requirementGroups),
    ),
  );

console.log(`Backfilling ${rows.length} course rows...`);

let done = 0;
for (const row of rows) {
  const structure = row.curriculumStructure;
  await db
    .update(courses)
    .set({
      requirementGroups: extractRequirementGroups(structure),
      embeddedSpecialisations: extractEmbeddedSpecialisations(structure),
      subCourseRefs: extractSubCourseRefs(structure),
      componentLabels: extractComponentLabels(structure),
    })
    .where(and(eq(courses.year, row.year), eq(courses.code, row.code)));
  done++;
  if (done % 50 === 0) console.log(`  ${done}/${rows.length}`);
}

console.log(`Done. Updated ${done} courses.`);
process.exit(0);
