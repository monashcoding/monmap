/**
 * Corpus-wide evaluation of the requirement-group extractor. Read-only
 * against the DB: recomputes groups for every course (and AoS) in
 * every handbook year, diffs the auto-load sets against the currently
 * stored (old-parser) values, and checks structural invariants.
 *
 *   pnpm eval:curriculum                 # summary to stdout
 *   pnpm eval:curriculum --out report.md # full markdown report
 *   pnpm eval:curriculum --year 2026     # single year
 *
 * Invariants:
 *   I1  every double-degree component course whose curriculum holds
 *       subject leaves must produce non-empty groups (the "half my
 *       degree is invisible" bug, directly)
 *   I2  Σ credit points of a course's auto-load set ≤ course cp
 *   I3  auto-load unit codes must exist in `units` for that year (warn:
 *       webapp filters these, but they signal extraction junk)
 *   I4  auto-load units with no offered=true offering (warn: webapp
 *       must filter these at query time)
 *   I5  no campus-scoped group may auto-load unless the whole course
 *       is single-scoped
 *   I6  recall: every subject leaf in a course's curriculum appears in
 *       some group's options (residue = invisible units)
 *
 * Cross-exposure: groups the OLD deployed code (legacy
 * `required === options.length` rule, blind to `autoLoad`) would
 * force-load from NEW rows but the new code wouldn't. This measures
 * the harm window if data is recomputed before the webapp deploys —
 * if non-trivial, deploy the webapp first.
 */
import { writeFileSync } from "node:fs";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  applyCurriculumOverrides,
  courses,
  createDb,
  areasOfStudy,
  extractRequirementGroups,
  pickDefaultUnits,
  unitOfferings,
  units,
  type RequirementGroup,
} from "@monmap/db";
import { DATABASE_URL } from "@monmap/db/env";
import { loadCurriculumOverrides } from "./overrides.ts";

const outFlag = process.argv.indexOf("--out");
const outPath = outFlag !== -1 ? process.argv[outFlag + 1] : undefined;
const yearFlag = process.argv.indexOf("--year");
const onlyYear = yearFlag !== -1 ? process.argv[yearFlag + 1] : undefined;

const overrides = loadCurriculumOverrides();

const db = createDb(DATABASE_URL, {
  pool: { max: 2, idle_timeout: 0, prepare: false },
});

const legacyAuto = (groups: readonly RequirementGroup[]): Set<string> => {
  const out = new Set<string>();
  for (const g of groups) {
    if (g.required !== g.options.length) continue;
    for (const c of g.options) out.add(c);
  }
  return out;
};

const newAuto = (groups: readonly RequirementGroup[]): Set<string> =>
  new Set(pickDefaultUnits(groups).map((u) => u.code));

function collectSubjectCodes(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const x of node) collectSubjectCodes(x, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const n = node as Record<string, unknown>;
  const typeRef = n["academic_item_type"] as { value?: string } | undefined;
  if (typeRef?.value === "subject" && typeof n["academic_item_code"] === "string") {
    out.add((n["academic_item_code"] as string).toUpperCase());
  }
  for (const v of Object.values(n)) collectSubjectCodes(v, out);
}

const yearsRows = await db
  .selectDistinct({ year: courses.year })
  .from(courses);
const years = yearsRows
  .map((r) => r.year)
  .filter((y) => !onlyYear || y === onlyYear)
  .sort();

const lines: string[] = ["# Curriculum extraction eval", ""];
const say = (s: string) => {
  lines.push(s);
  console.log(s);
};

interface Violation {
  year: string;
  code: string;
  detail: string;
}
const violations: Record<string, Violation[]> = {
  I1: [], I2: [], I3: [], I4: [], I5: [], I6: [],
};
let crossExposedGroups = 0;
const crossExposedCourses = new Set<string>();
const bigDiffs: Array<{
  year: string;
  code: string;
  gained: string[];
  lost: string[];
}> = [];

for (const year of years) {
  const courseRows = await db
    .select({
      code: courses.code,
      title: courses.title,
      creditPoints: courses.creditPoints,
      requirementGroups: courses.requirementGroups,
      subCourseRefs: courses.subCourseRefs,
      curriculumStructure: courses.curriculumStructure,
    })
    .from(courses)
    .where(and(eq(courses.year, year), isNotNull(courses.curriculumStructure)));

  const unitRows = await db
    .select({ code: units.code, cp: units.creditPoints })
    .from(units)
    .where(eq(units.year, year));
  const unitCp = new Map(unitRows.map((r) => [r.code, r.cp ?? 6]));

  const offeredRows = await db
    .selectDistinct({ code: unitOfferings.unitCode })
    .from(unitOfferings)
    .where(and(eq(unitOfferings.year, year), eq(unitOfferings.offered, true)));
  const offered = new Set(offeredRows.map((r) => r.code));

  // Recompute every course.
  const newGroupsByCode = new Map<string, RequirementGroup[]>();
  let oldNonEmpty = 0;
  let newNonEmpty = 0;
  let autoChanged = 0;
  let gainedTotal = 0;
  let lostTotal = 0;

  for (const row of courseRows) {
    const extracted = extractRequirementGroups(
      row.curriculumStructure,
      row.creditPoints ?? 0,
    );
    const { groups } = applyCurriculumOverrides(
      row.code,
      year,
      extracted,
      overrides,
    );
    newGroupsByCode.set(row.code, groups);

    const oldGroups = (row.requirementGroups ?? []) as RequirementGroup[];
    if (oldGroups.length > 0) oldNonEmpty++;
    if (groups.length > 0) newNonEmpty++;

    const oldSet = new Set(
      pickDefaultUnits(oldGroups).map((u) => u.code),
    );
    const newSet = newAuto(groups);
    const gained = [...newSet].filter((c) => !oldSet.has(c));
    const lost = [...oldSet].filter((c) => !newSet.has(c));
    if (gained.length || lost.length) {
      autoChanged++;
      gainedTotal += gained.length;
      lostTotal += lost.length;
      if (gained.length + lost.length >= 5)
        bigDiffs.push({ year, code: row.code, gained, lost });
    }

    // Cross-exposure: legacy rule over NEW groups vs new rule.
    const legacySet = legacyAuto(groups);
    const exposed = [...legacySet].filter((c) => !newSet.has(c));
    if (exposed.length > 0) {
      crossExposedGroups += exposed.length;
      crossExposedCourses.add(`${year}/${row.code}`);
    }

    // I2: auto-load cp budget.
    const autoCp = [...newSet].reduce((s, c) => s + (unitCp.get(c) ?? 6), 0);
    if (row.creditPoints && autoCp > row.creditPoints) {
      violations["I2"]!.push({
        year,
        code: row.code,
        detail: `auto-load ${autoCp}cp > course ${row.creditPoints}cp`,
      });
    }
    // I3/I4.
    const unknown = [...newSet].filter((c) => !unitCp.has(c));
    if (unknown.length > 0)
      violations["I3"]!.push({
        year,
        code: row.code,
        detail: `auto-load units missing from corpus: ${unknown.join(", ")}`,
      });
    const unoffered = [...newSet].filter(
      (c) => unitCp.has(c) && !offered.has(c),
    );
    if (unoffered.length > 0)
      violations["I4"]!.push({
        year,
        code: row.code,
        detail: `auto-load units with no offering: ${unoffered.join(", ")}`,
      });
    // I5: scoped auto-loads only allowed when course is single-scoped.
    const scopes = new Set(groups.map((g) => g.scope).filter(Boolean));
    const hasUnscoped = groups.some((g) => !g.scope);
    const scopedAuto = groups.filter((g) => g.scope && g.autoLoad);
    if (scopedAuto.length > 0 && (scopes.size >= 2 || hasUnscoped === true) && !(scopes.size === 1 && !hasUnscoped)) {
      violations["I5"]!.push({
        year,
        code: row.code,
        detail: `scoped groups auto-load: ${scopedAuto.map((g) => g.grouping).join(" | ")}`,
      });
    }
    // I6: recall residue.
    const leafCodes = new Set<string>();
    collectSubjectCodes(row.curriculumStructure, leafCodes);
    const covered = new Set(groups.flatMap((g) => g.options));
    const residue = [...leafCodes].filter((c) => !covered.has(c));
    if (residue.length > 0)
      violations["I6"]!.push({
        year,
        code: row.code,
        detail: `${residue.length} subject leaves uncovered: ${residue.slice(0, 8).join(", ")}${residue.length > 8 ? "…" : ""}`,
      });
  }

  // I1: double-degree components.
  let ddRefs = 0;
  let ddEmptyOld = 0;
  let ddEmptyNew = 0;
  for (const row of courseRows) {
    const refs = (row.subCourseRefs ?? []) as Array<{ courseCode: string }>;
    for (const ref of refs) {
      const target = courseRows.find((r) => r.code === ref.courseCode);
      if (!target) continue;
      ddRefs++;
      const targetLeaves = new Set<string>();
      collectSubjectCodes(target.curriculumStructure, targetLeaves);
      const oldGroups = (target.requirementGroups ?? []) as RequirementGroup[];
      const newGroups = newGroupsByCode.get(target.code) ?? [];
      if (oldGroups.length === 0) ddEmptyOld++;
      if (newGroups.length === 0) {
        ddEmptyNew++;
        if (targetLeaves.size > 0) {
          violations["I1"]!.push({
            year,
            code: row.code,
            detail: `component ${ref.courseCode} has ${targetLeaves.size} subject leaves but 0 groups`,
          });
        }
      }
    }
  }

  say(
    `## ${year}: ${courseRows.length} courses — groups ${oldNonEmpty}→${newNonEmpty} non-empty, ` +
      `auto-load changed for ${autoChanged} (+${gainedTotal}/−${lostTotal} units), ` +
      `DD components empty ${ddEmptyOld}→${ddEmptyNew} of ${ddRefs} refs`,
  );
}

say("");
say("## Invariants");
for (const [k, v] of Object.entries(violations)) {
  say(`- ${k}: ${v.length === 0 ? "OK" : `${v.length} violation(s)`}`);
}
say(
  `- cross-exposure (legacy rule on new rows): ${crossExposedGroups} unit(s) across ${crossExposedCourses.size} course-year(s)`,
);

for (const [k, v] of Object.entries(violations)) {
  if (v.length === 0) continue;
  lines.push("", `### ${k}`);
  for (const x of v.slice(0, 200))
    lines.push(`- ${x.year} ${x.code}: ${x.detail}`);
}

lines.push("", "## Largest auto-load diffs (≥5 units changed)");
for (const d of bigDiffs.slice(0, 100)) {
  lines.push(
    `- ${d.year} ${d.code}: +[${d.gained.join(",")}] −[${d.lost.join(",")}]`,
  );
}

// AoS sweep: extraction runs live at query time in the webapp, so any
// extractor change shifts AoS templates on deploy. Check invariants
// (no stored baseline exists to diff against).
say("");
say("## Areas of study");
for (const year of years) {
  const aosRows = await db
    .select({
      code: areasOfStudy.code,
      creditPoints: areasOfStudy.creditPoints,
      curriculumStructure: areasOfStudy.curriculumStructure,
    })
    .from(areasOfStudy)
    .where(
      and(eq(areasOfStudy.year, year), isNotNull(areasOfStudy.curriculumStructure)),
    );
  let nonEmpty = 0;
  let residueCount = 0;
  let scopedAutoCount = 0;
  for (const row of aosRows) {
    const groups = extractRequirementGroups(
      row.curriculumStructure,
      row.creditPoints ?? 0,
    );
    if (groups.length > 0) nonEmpty++;
    const leaves = new Set<string>();
    collectSubjectCodes(row.curriculumStructure, leaves);
    const covered = new Set(groups.flatMap((g) => g.options));
    if ([...leaves].some((c) => !covered.has(c))) residueCount++;
    const scopes = new Set(groups.map((g) => g.scope).filter(Boolean));
    const hasUnscoped = groups.some((g) => !g.scope);
    if (
      groups.some((g) => g.scope && g.autoLoad) &&
      !(scopes.size === 1 && !hasUnscoped)
    )
      scopedAutoCount++;
  }
  say(
    `- ${year}: ${aosRows.length} AoS, ${nonEmpty} with groups, ${residueCount} with recall residue, ${scopedAutoCount} scoped-auto-load`,
  );
}

if (outPath) {
  writeFileSync(outPath, lines.join("\n") + "\n");
  console.log(`\nreport written to ${outPath}`);
}
process.exit(0);
