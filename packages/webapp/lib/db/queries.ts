import {
  areaOfStudyUnits,
  areasOfStudy,
  courseAreasOfStudy,
  courses,
  enrolmentRules,
  requisites,
  unitOfferings,
  units,
} from "@monmap/db";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { getDb, HANDBOOK_YEAR } from "./client.ts";
import { classifyTeachingPeriod } from "../planner/teaching-period.ts";
import type {
  PlannerAreaOfStudy,
  PlannerCourse,
  PlannerCourseWithAoS,
  PlannerOffering,
  PlannerUnit,
  RequisiteBlock,
  RequisiteRule,
} from "../planner/types.ts";

/**
 * All queries are year-scoped to HANDBOOK_YEAR. Multi-year planning
 * isn't in scope for this MVP — the handbook has one populated year
 * (2026) and mixing years breaks the requisite-evaluation model we
 * depend on (requisite leaves already erase year per `requisite_refs`).
 */

export async function listCoursesForPicker(
  search: string | null,
  limit = 50,
): Promise<PlannerCourse[]> {
  const db = getDb();
  const conds = [
    eq(courses.year, HANDBOOK_YEAR),
    sql`${courses.creditPoints} > 0`,
  ];
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    conds.push(or(ilike(courses.title, q), ilike(courses.code, q))!);
  }
  const rows = await db
    .select({
      year: courses.year,
      code: courses.code,
      title: courses.title,
      creditPoints: courses.creditPoints,
      aqfLevel: courses.aqfLevel,
      type: courses.type,
      overview: courses.overview,
    })
    .from(courses)
    .where(and(...conds))
    .orderBy(courses.title)
    .limit(limit);

  return rows.map((r) => ({
    year: r.year,
    code: r.code,
    title: r.title,
    creditPoints: r.creditPoints ?? 0,
    aqfLevel: r.aqfLevel,
    type: r.type,
    overview: r.overview,
  }));
}

/**
 * Load a course plus the AoS it offers. Groups edges by (year, code)
 * so each AoS appears once even if it's listed under multiple
 * relationshipLabels (rare but possible).
 */
export async function fetchCourseWithAoS(
  code: string,
): Promise<PlannerCourseWithAoS | null> {
  const db = getDb();
  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.year, HANDBOOK_YEAR), eq(courses.code, code)))
    .limit(1);
  if (!course) return null;

  const links = await db
    .select({
      aosCode: courseAreasOfStudy.aosCode,
      aosYear: courseAreasOfStudy.aosYear,
      kind: courseAreasOfStudy.kind,
      relationshipLabel: courseAreasOfStudy.relationshipLabel,
      title: areasOfStudy.title,
      creditPoints: areasOfStudy.creditPoints,
    })
    .from(courseAreasOfStudy)
    .leftJoin(
      areasOfStudy,
      and(
        eq(courseAreasOfStudy.aosYear, areasOfStudy.year),
        eq(courseAreasOfStudy.aosCode, areasOfStudy.code),
      ),
    )
    .where(
      and(
        eq(courseAreasOfStudy.courseYear, HANDBOOK_YEAR),
        eq(courseAreasOfStudy.courseCode, code),
      ),
    );

  if (links.length === 0) {
    return {
      year: course.year,
      code: course.code,
      title: course.title,
      creditPoints: course.creditPoints ?? 0,
      aqfLevel: course.aqfLevel,
      type: course.type,
      overview: course.overview,
      areasOfStudy: [],
    };
  }

  const aosCodes = [...new Set(links.map((l) => l.aosCode))];
  const unitRows = await db
    .select({
      aosCode: areaOfStudyUnits.aosCode,
      unitCode: areaOfStudyUnits.unitCode,
      grouping: areaOfStudyUnits.grouping,
    })
    .from(areaOfStudyUnits)
    .where(
      and(
        eq(areaOfStudyUnits.aosYear, HANDBOOK_YEAR),
        inArray(areaOfStudyUnits.aosCode, aosCodes),
      ),
    )
    .orderBy(areaOfStudyUnits.grouping, areaOfStudyUnits.unitCode);

  const unitsByAos = new Map<string, { code: string; grouping: string }[]>();
  for (const u of unitRows) {
    const list = unitsByAos.get(u.aosCode) ?? [];
    list.push({ code: u.unitCode, grouping: u.grouping });
    unitsByAos.set(u.aosCode, list);
  }

  // De-duplicate course→AoS edges that share (code, kind) — first label wins
  const byCode = new Map<string, PlannerAreaOfStudy>();
  for (const l of links) {
    if (byCode.has(l.aosCode)) continue;
    byCode.set(l.aosCode, {
      code: l.aosCode,
      title: l.title ?? l.aosCode,
      kind: l.kind,
      relationshipLabel: l.relationshipLabel,
      creditPoints: l.creditPoints,
      units: unitsByAos.get(l.aosCode) ?? [],
    });
  }

  const orderedAos = [...byCode.values()].sort((a, b) => {
    if (a.kind !== b.kind) return kindOrder(a.kind) - kindOrder(b.kind);
    return a.title.localeCompare(b.title);
  });

  return {
    year: course.year,
    code: course.code,
    title: course.title,
    creditPoints: course.creditPoints ?? 0,
    aqfLevel: course.aqfLevel,
    type: course.type,
    overview: course.overview,
    areasOfStudy: orderedAos,
  };
}

function kindOrder(k: PlannerAreaOfStudy["kind"]): number {
  switch (k) {
    case "major": return 0;
    case "extended_major": return 1;
    case "specialisation": return 2;
    case "minor": return 3;
    case "elective": return 4;
    case "other": return 5;
  }
}

/**
 * Fetch full unit records for the given codes. Missing codes are
 * silently dropped — the caller can diff against the input list.
 */
export async function fetchUnitsByCode(
  codes: readonly string[],
): Promise<PlannerUnit[]> {
  if (codes.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      year: units.year,
      code: units.code,
      title: units.title,
      creditPoints: units.creditPoints,
      level: units.level,
      synopsis: units.handbookSynopsis,
      school: units.school,
    })
    .from(units)
    .where(and(eq(units.year, HANDBOOK_YEAR), inArray(units.code, [...codes])));

  return rows.map((r) => ({
    year: r.year,
    code: r.code,
    title: r.title,
    creditPoints: r.creditPoints ?? 0,
    level: r.level,
    synopsis: r.synopsis,
    school: r.school,
  }));
}

export async function searchUnits(
  query: string,
  limit = 25,
): Promise<PlannerUnit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const db = getDb();
  const q = `%${trimmed}%`;
  const rows = await db
    .select({
      year: units.year,
      code: units.code,
      title: units.title,
      creditPoints: units.creditPoints,
      level: units.level,
      synopsis: units.handbookSynopsis,
      school: units.school,
    })
    .from(units)
    .where(
      and(
        eq(units.year, HANDBOOK_YEAR),
        or(ilike(units.code, q), ilike(units.title, q)),
      ),
    )
    .orderBy(units.code)
    .limit(limit);

  return rows.map((r) => ({
    year: r.year,
    code: r.code,
    title: r.title,
    creditPoints: r.creditPoints ?? 0,
    level: r.level,
    synopsis: r.synopsis,
    school: r.school,
  }));
}

export async function fetchOfferingsForCodes(
  codes: readonly string[],
): Promise<Map<string, PlannerOffering[]>> {
  const out = new Map<string, PlannerOffering[]>();
  if (codes.length === 0) return out;

  const db = getDb();
  const rows = await db
    .select({
      unitCode: unitOfferings.unitCode,
      teachingPeriod: unitOfferings.teachingPeriod,
      location: unitOfferings.location,
      attendanceModeCode: unitOfferings.attendanceModeCode,
    })
    .from(unitOfferings)
    .where(
      and(
        eq(unitOfferings.year, HANDBOOK_YEAR),
        eq(unitOfferings.offered, true),
        inArray(unitOfferings.unitCode, [...codes]),
      ),
    );

  for (const r of rows) {
    const list = out.get(r.unitCode) ?? [];
    list.push({
      unitCode: r.unitCode,
      teachingPeriod: r.teachingPeriod ?? "",
      location: r.location,
      attendanceModeCode: r.attendanceModeCode,
      periodKind: classifyTeachingPeriod(r.teachingPeriod),
    });
    out.set(r.unitCode, list);
  }
  return out;
}

export async function fetchRequisitesForCodes(
  codes: readonly string[],
): Promise<Map<string, RequisiteBlock[]>> {
  const out = new Map<string, RequisiteBlock[]>();
  if (codes.length === 0) return out;

  const db = getDb();
  const rows = await db
    .select({
      unitCode: requisites.unitCode,
      requisiteType: requisites.requisiteType,
      rule: requisites.rule,
    })
    .from(requisites)
    .where(
      and(
        eq(requisites.year, HANDBOOK_YEAR),
        inArray(requisites.unitCode, [...codes]),
      ),
    );

  for (const r of rows) {
    const list = out.get(r.unitCode) ?? [];
    list.push({
      requisiteType: r.requisiteType,
      rule: (r.rule as RequisiteRule | null) ?? null,
    });
    out.set(r.unitCode, list);
  }
  return out;
}

export async function fetchEnrolmentRulesForCodes(
  codes: readonly string[],
): Promise<Map<string, { ruleType: string | null; description: string | null }[]>> {
  const out = new Map<string, { ruleType: string | null; description: string | null }[]>();
  if (codes.length === 0) return out;

  const db = getDb();
  const rows = await db
    .select({
      unitCode: enrolmentRules.unitCode,
      ruleType: enrolmentRules.ruleType,
      description: enrolmentRules.description,
    })
    .from(enrolmentRules)
    .where(
      and(
        eq(enrolmentRules.year, HANDBOOK_YEAR),
        inArray(enrolmentRules.unitCode, [...codes]),
      ),
    );

  for (const r of rows) {
    const list = out.get(r.unitCode) ?? [];
    list.push({ ruleType: r.ruleType, description: r.description });
    out.set(r.unitCode, list);
  }
  return out;
}

/**
 * Hydrate every piece of per-unit data the planner needs for a given
 * set of codes. Single round-trip from the UI's perspective (three
 * parallel DB queries internally).
 */
export async function hydratePlannerUnits(codes: readonly string[]): Promise<{
  units: Map<string, PlannerUnit>;
  offerings: Map<string, PlannerOffering[]>;
  requisites: Map<string, RequisiteBlock[]>;
}> {
  const [unitList, offerings, reqs] = await Promise.all([
    fetchUnitsByCode(codes),
    fetchOfferingsForCodes(codes),
    fetchRequisitesForCodes(codes),
  ]);
  const unitsByCode = new Map(unitList.map((u) => [u.code, u]));
  return { units: unitsByCode, offerings, requisites: reqs };
}
