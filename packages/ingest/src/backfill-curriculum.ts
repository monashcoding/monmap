/**
 * Refresh derived curriculum data from each course's stored
 * `curriculum_structure` JSONB without needing the original raw JSON
 * files on disk. Modes:
 *
 *   pnpm backfill:curriculum               # only rows with NULL precomputes (idempotent)
 *   pnpm backfill:curriculum --force       # re-derive every row + course_areas_of_study
 *   pnpm backfill:curriculum --force --year 2026   # limit to one handbook year
 *   pnpm backfill:curriculum --force --dry-run     # report changes, write nothing
 *
 * `--force` mode is what you run after changing an extractor heuristic
 * — it overwrites the precomputed columns and re-walks every course's
 * curriculum to refresh `course_areas_of_study` (kind classification,
 * relationship_label). Useful for older years where the raw JSON
 * isn't available for a full re-ingest.
 *
 * Checked-in curriculum overrides are re-applied after extraction, so
 * a recompute can never wipe a hand fix.
 */
import { and, eq, inArray, isNull, isNotNull, or } from "drizzle-orm";
import {
  applyCurriculumOverrides,
  createDb,
  areasOfStudy,
  courseAreasOfStudy,
  courses,
  extractComponentLabels,
  extractEmbeddedSpecialisations,
  extractExcludedAos,
  extractRequirementGroups,
  extractSubCourseRefs,
} from "@monmap/db";
import { DATABASE_URL } from "@monmap/db/env";
import { extractCourseAosRefs } from "./parse.ts";
import { loadCurriculumOverrides } from "./overrides.ts";

const force = process.argv.includes("--force");
const dryRun = process.argv.includes("--dry-run");
const yearFlag = process.argv.indexOf("--year");
const onlyYear = yearFlag !== -1 ? process.argv[yearFlag + 1] : undefined;
if (yearFlag !== -1 && !/^\d{4}$/.test(onlyYear ?? ""))
  throw new Error("--year requires a 4-digit year argument");

const overrides = loadCurriculumOverrides();

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
      force
        ? isNotNull(courses.curriculumStructure)
        : and(
            isNotNull(courses.curriculumStructure),
            // A row needs backfilling when any precompute column is
            // missing — requirement_groups for pre-0006 rows,
            // excluded_aos for pre-0010 rows.
            or(
              isNull(courses.requirementGroups),
              isNull(courses.excludedAos),
            ),
          ),
      ...(onlyYear ? [eq(courses.year, onlyYear)] : []),
    ),
  );

console.log(
  `${force ? "Force-refreshing" : "Backfilling"} ${rows.length} course rows` +
    `${onlyYear ? ` (year ${onlyYear})` : ""}${dryRun ? " [dry-run]" : ""}...`,
);

let done = 0;
let overridden = 0;
for (const row of rows) {
  const structure = row.curriculumStructure;
  const extracted = extractRequirementGroups(structure, row.creditPoints ?? 0);
  const { groups, applied } = applyCurriculumOverrides(
    row.code,
    row.year,
    extracted,
    overrides,
  );
  if (applied.length > 0) overridden++;
  if (!dryRun) {
    await db
      .update(courses)
      .set({
        requirementGroups: groups,
        embeddedSpecialisations: extractEmbeddedSpecialisations(structure),
        subCourseRefs: extractSubCourseRefs(structure),
        componentLabels: extractComponentLabels(structure),
        excludedAos: extractExcludedAos(structure),
      })
      .where(and(eq(courses.year, row.year), eq(courses.code, row.code)));
  }
  done++;
  if (done % 50 === 0) console.log(`  ${done}/${rows.length}`);
}

console.log(
  `Done. ${dryRun ? "Would update" : "Updated"} ${done} courses (${overridden} with overrides).`,
);

if (force && !dryRun) {
  // Refresh course_areas_of_study by re-walking every course's
  // curriculum_structure with the current extractor. We need the
  // per-year AoS code set to pass to extractCourseAosRefs.
  console.log("Refreshing course_areas_of_study from curriculum_structure...");
  const aosCodesByYear = new Map<string, Set<string>>();
  const aosRows = await db
    .select({ year: areasOfStudy.year, code: areasOfStudy.code })
    .from(areasOfStudy);
  for (const r of aosRows) {
    const set = aosCodesByYear.get(r.year) ?? new Set();
    set.add(r.code.toUpperCase());
    aosCodesByYear.set(r.year, set);
  }

  const years = [...aosCodesByYear.keys()]
    .filter((y) => !onlyYear || y === onlyYear)
    .sort();
  for (const year of years) {
    const aosCodes = aosCodesByYear.get(year)!;
    const yearRows = rows.filter((r) => r.year === year);
    const newRows = yearRows.flatMap((r) =>
      extractCourseAosRefs(year, r.code, r.curriculumStructure, aosCodes),
    );
    await db.transaction(async (tx) => {
      await tx
        .delete(courseAreasOfStudy)
        .where(eq(courseAreasOfStudy.courseYear, year));
      if (newRows.length > 0) {
        // Chunk inserts to keep statement sizes sane.
        for (let i = 0; i < newRows.length; i += 200) {
          await tx
            .insert(courseAreasOfStudy)
            .values(newRows.slice(i, i + 200));
        }
      }
    });
    console.log(`  ${year}: ${newRows.length} course→AoS rows`);
  }
  // Suppress drizzle unused-import warning for inArray.
  void inArray;
}

process.exit(0);
