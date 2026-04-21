import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import {
  areasOfStudy,
  courses,
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
import { parseAos, parseCourse, parseUnit } from "./parse.ts";

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
  for (const f of unitFiles) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await readJson<UnitContent>(join(base, "units", f));
      const { unit, offerings, requisites: reqs } = parseUnit(year, raw);
      unitRows.push(unit);
      offeringRows.push(...offerings);
      requisiteRows.push(...reqs);
    } catch (e) {
      badFiles.push({ file: `units/${f}`, reason: String(e) });
    }
  }
  console.log(`  units: parsed ${unitRows.length} (+ ${offeringRows.length} offerings, ${requisiteRows.length} requisites)`);

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

  /*
   * Replace-for-year strategy: drop existing rows for this year, then
   * bulk-insert. Simpler and faster than upserting ~6k rows individually,
   * and a rerun stays idempotent because the transaction rolls back on
   * failure — no half-ingested state.
   */
  await db.transaction(async (tx) => {
    await tx.delete(unitOfferings).where(eq(unitOfferings.year, year));
    await tx.delete(requisites).where(eq(requisites.year, year));
    await tx.delete(units).where(eq(units.year, year));
    await tx.delete(courses).where(eq(courses.year, year));
    await tx.delete(areasOfStudy).where(eq(areasOfStudy.year, year));

    for (const batch of chunk(unitRows, CHUNK)) await tx.insert(units).values(batch);
    for (const batch of chunk(courseRows, CHUNK)) await tx.insert(courses).values(batch);
    for (const batch of chunk(aosRows, CHUNK)) await tx.insert(areasOfStudy).values(batch);
    for (const batch of chunk(offeringRows, CHUNK)) await tx.insert(unitOfferings).values(batch);
    for (const batch of chunk(requisiteRows, CHUNK)) await tx.insert(requisites).values(batch);
  });

  return {
    units: unitRows.length,
    courses: courseRows.length,
    aos: aosRows.length,
    unitOfferings: offeringRows.length,
    requisites: requisiteRows.length,
    badFiles,
  };
}
