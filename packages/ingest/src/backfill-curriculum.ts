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
 * relationship_label) and `unit_year_links`. Useful for older years where the raw JSON
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
  units,
  unitYearLinks,
} from "@monmap/db";
import { DATABASE_URL } from "@monmap/db/env";
import {
  extractCourseAosRefs,
  extractUnitYearLinks,
  foldPlaceholderUnits,
  resolveSubCourseYears,
} from "./parse.ts";
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

// Every (year, code) course row, so a component linked to an earlier
// year's page resolves only when that row exists.
const knownCourseKeys = new Set(
  (
    await db.select({ year: courses.year, code: courses.code }).from(courses)
  ).map((r) => `${r.year}|${r.code.toUpperCase()}`),
);

// Unit codes per year, so placeholder unit containers fold into leaves
// exactly as they do at ingest (`foldPlaceholderUnits`).
const unitCodesByYear = new Map<string, Set<string>>();
for (const r of await db
  .select({ year: units.year, code: units.code })
  .from(units)) {
  const set = unitCodesByYear.get(r.year) ?? new Set<string>();
  set.add(r.code.toUpperCase());
  unitCodesByYear.set(r.year, set);
}

let done = 0;
let overridden = 0;
for (const row of rows) {
  const structure = foldPlaceholderUnits(
    row.curriculumStructure,
    unitCodesByYear.get(row.year) ?? new Set<string>(),
  ).structure;
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
        subCourseRefs: resolveSubCourseYears(
          row.year,
          extractSubCourseRefs(structure, row.year),
          knownCourseKeys,
        ),
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
  console.log(
    "Refreshing course_areas_of_study and unit_year_links from curriculum_structure...",
  );
  const aosCodesByYear = new Map<string, Set<string>>();
  const aosRows = await db
    .select({ year: areasOfStudy.year, code: areasOfStudy.code })
    .from(areasOfStudy);
  for (const r of aosRows) {
    const set = aosCodesByYear.get(r.year) ?? new Set();
    set.add(r.code.toUpperCase());
    aosCodesByYear.set(r.year, set);
  }

  // Every (year, code) unit row, for unit_year_links: a unit counts
  // only when the year lacks it and the linked year has it.
  const unitRows = await db
    .select({ year: units.year, code: units.code })
    .from(units);

  const years = [...aosCodesByYear.keys()]
    .filter((y) => !onlyYear || y === onlyYear)
    .sort();
  for (const year of years) {
    const aosCodes = aosCodesByYear.get(year)!;
    // Earlier years' AoS, for courses that link a previous year's page.
    const earlierAosKeys = new Set(
      aosRows
        .filter((r) => r.year < year)
        .map((r) => `${r.year}|${r.code.toUpperCase()}`),
    );
    const yearRows = rows.filter((r) => r.year === year);
    const newRows = yearRows.flatMap((r) =>
      extractCourseAosRefs(
        year,
        r.code,
        r.curriculumStructure,
        aosCodes,
        earlierAosKeys,
      ),
    );
    // Same rule as ingest: the year's course and AoS trees, against the
    // year's own units and every earlier year's.
    const yearAosStructures = await db
      .select({ curriculumStructure: areasOfStudy.curriculumStructure })
      .from(areasOfStudy)
      .where(eq(areasOfStudy.year, year));
    const linkRows = extractUnitYearLinks(
      year,
      [
        ...yearRows.map((r) => r.curriculumStructure),
        ...yearAosStructures.map((r) => r.curriculumStructure),
      ],
      new Set(
        unitRows.filter((r) => r.year === year).map((r) => r.code.toUpperCase()),
      ),
      new Set(
        unitRows
          .filter((r) => r.year < year)
          .map((r) => `${r.year}|${r.code.toUpperCase()}`),
      ),
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
      await tx.delete(unitYearLinks).where(eq(unitYearLinks.year, year));
      if (linkRows.length > 0)
        await tx.insert(unitYearLinks).values(linkRows);
    });
    console.log(
      `  ${year}: ${newRows.length} course→AoS rows, ${linkRows.length} earlier-year units`,
    );
  }
  // Suppress drizzle unused-import warning for inArray.
  void inArray;
}

process.exit(0);
