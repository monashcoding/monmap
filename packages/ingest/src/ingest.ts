import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import {
  areaOfStudyUnits,
  areasOfStudy,
  courseAreasOfStudy,
  courses,
  enrolmentRules,
  requisiteRefs,
  requisites,
  unitOfferings,
  units,
  type Database,
} from "@monmap/db";
import type {
  AosContent,
  CourseContent,
  UnitContent,
} from "@monmap/scraper/types";
import {
  extractAosUnitRefs,
  extractCourseAosRefs,
  parseAos,
  parseCourse,
  parseUnit,
} from "./parse.ts";

const CHUNK = 200;

interface IngestOptions {
  readonly db: Database;
  readonly dataDir: string;
  readonly year: string;
}

interface Summary {
  readonly units: number;
  readonly courses: number;
  readonly aos: number;
  readonly unitOfferings: number;
  readonly requisites: number;
  readonly requisiteRefs: number;
  readonly enrolmentRules: number;
  readonly courseAreasOfStudy: number;
  readonly areaOfStudyUnits: number;
  readonly badFiles: ReadonlyArray<{ file: string; reason: string }>;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function ingest(opts: IngestOptions): Promise<Summary> {
  const { db, dataDir, year } = opts;
  const base = join(dataDir, "raw", year);
  const badFiles: Array<{ file: string; reason: string }> = [];

  console.log(`ingesting year=${year} from ${base}`);

  /* -------- units ------------------------------------------------- */
  const unitFiles = await readdir(join(base, "units")).catch(() => []);
  const unitRows: ReturnType<typeof parseUnit>["unit"][] = [];
  const offeringRows: ReturnType<typeof parseUnit>["offerings"] = [];
  const requisiteRows: ReturnType<typeof parseUnit>["requisites"] = [];
  const requisiteRefRows: ReturnType<typeof parseUnit>["requisiteRefs"] = [];
  const enrolmentRuleRows: ReturnType<typeof parseUnit>["enrolmentRules"] = [];
  for (const f of unitFiles) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await readJson<UnitContent>(join(base, "units", f));
      const parsed = parseUnit(year, raw);
      unitRows.push(parsed.unit);
      offeringRows.push(...parsed.offerings);
      requisiteRows.push(...parsed.requisites);
      requisiteRefRows.push(...parsed.requisiteRefs);
      enrolmentRuleRows.push(...parsed.enrolmentRules);
    } catch (e) {
      badFiles.push({ file: `units/${f}`, reason: String(e) });
    }
  }
  console.log(
    `  units: parsed ${unitRows.length} ` +
      `(${offeringRows.length} offerings, ${requisiteRows.length} requisites, ` +
      `${requisiteRefRows.length} refs, ${enrolmentRuleRows.length} enrolment rules)`,
  );

  /* -------- courses ----------------------------------------------- */
  const courseFiles = await readdir(join(base, "courses")).catch(() => []);
  const courseRows: ReturnType<typeof parseCourse>["course"][] = [];
  for (const f of courseFiles) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await readJson<CourseContent>(join(base, "courses", f));
      courseRows.push(parseCourse(year, raw).course);
    } catch (e) {
      badFiles.push({ file: `courses/${f}`, reason: String(e) });
    }
  }
  console.log(`  courses: parsed ${courseRows.length}`);

  /* -------- aos --------------------------------------------------- */
  const aosFiles = await readdir(join(base, "aos")).catch(() => []);
  const aosRows: ReturnType<typeof parseAos>["aos"][] = [];
  for (const f of aosFiles) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await readJson<AosContent>(join(base, "aos", f));
      aosRows.push(parseAos(year, raw).aos);
    } catch (e) {
      badFiles.push({ file: `aos/${f}`, reason: String(e) });
    }
  }
  console.log(`  aos: parsed ${aosRows.length}`);

  /* -------- cross-entity tree walks ------------------------------- */
  const unitCodeSet = new Set(unitRows.map((u) => u.code.toUpperCase()));
  const aosCodeSet = new Set(aosRows.map((a) => a.code.toUpperCase()));

  const courseAosRows: ReturnType<typeof extractCourseAosRefs> = [];
  for (const c of courseRows) {
    courseAosRows.push(
      ...extractCourseAosRefs(year, c.code, c.curriculumStructure, aosCodeSet),
    );
  }

  const aosUnitRows: ReturnType<typeof extractAosUnitRefs> = [];
  for (const a of aosRows) {
    aosUnitRows.push(
      ...extractAosUnitRefs(year, a.code, a.curriculumStructure, unitCodeSet),
    );
  }
  console.log(
    `  cross-refs: ${courseAosRows.length} course→aos, ${aosUnitRows.length} aos→unit`,
  );

  /*
   * Replace-for-year: drop this year's rows, then bulk-insert. Simpler
   * and faster than per-row upsert at this scale, and the transaction
   * rolls back on failure so a rerun never half-ingests.
   */
  await db.transaction(async (tx) => {
    // Drop derived rows first so we don't violate any implicit ordering.
    await tx.delete(unitOfferings).where(eq(unitOfferings.year, year));
    await tx.delete(requisites).where(eq(requisites.year, year));
    await tx.delete(requisiteRefs).where(eq(requisiteRefs.year, year));
    await tx.delete(enrolmentRules).where(eq(enrolmentRules.year, year));
    await tx.delete(courseAreasOfStudy).where(eq(courseAreasOfStudy.courseYear, year));
    await tx.delete(areaOfStudyUnits).where(eq(areaOfStudyUnits.aosYear, year));
    await tx.delete(units).where(eq(units.year, year));
    await tx.delete(courses).where(eq(courses.year, year));
    await tx.delete(areasOfStudy).where(eq(areasOfStudy.year, year));

    for (const batch of chunk(unitRows, CHUNK)) await tx.insert(units).values(batch);
    for (const batch of chunk(courseRows, CHUNK)) await tx.insert(courses).values(batch);
    for (const batch of chunk(aosRows, CHUNK)) await tx.insert(areasOfStudy).values(batch);
    for (const batch of chunk(offeringRows, CHUNK)) await tx.insert(unitOfferings).values(batch);
    for (const batch of chunk(requisiteRows, CHUNK)) await tx.insert(requisites).values(batch);
    for (const batch of chunk(requisiteRefRows, CHUNK)) await tx.insert(requisiteRefs).values(batch);
    for (const batch of chunk(enrolmentRuleRows, CHUNK)) await tx.insert(enrolmentRules).values(batch);
    for (const batch of chunk(courseAosRows, CHUNK)) await tx.insert(courseAreasOfStudy).values(batch);
    for (const batch of chunk(aosUnitRows, CHUNK)) await tx.insert(areaOfStudyUnits).values(batch);
  });

  return {
    units: unitRows.length,
    courses: courseRows.length,
    aos: aosRows.length,
    unitOfferings: offeringRows.length,
    requisites: requisiteRows.length,
    requisiteRefs: requisiteRefRows.length,
    enrolmentRules: enrolmentRuleRows.length,
    courseAreasOfStudy: courseAosRows.length,
    areaOfStudyUnits: aosUnitRows.length,
    badFiles,
  };
}
