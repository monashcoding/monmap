/**
 * Monmap handbook schema.
 *
 * Shape decisions:
 *   1. Composite PK (year, code) on every entity. Handbook data is year-
 *      scoped and the same code yields different content across years.
 *   2. Hybrid normalize + JSONB. Fields that queries actually hit get
 *      real columns; the recursive/detail-only trees (curriculumStructure,
 *      assessments, unit_learning_outcomes, enrolment_rules_group,
 *      workload_requirements) ride through as JSONB inside `raw`.
 *   3. `raw` holds the full pageContent verbatim — forward-compat escape
 *      hatch so downstream adapters can reach for fields we haven't
 *      normalised yet.
 *   4. Snake-case DB, camelCase TS via `casing: "snake_case"` in
 *      drizzle.config.ts.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
} from "drizzle-orm/pg-core";
import type {
  AosContent,
  CourseContent,
  CurriculumStructure,
  UnitContent,
} from "@monmap/scraper/types";

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

/**
 * `prerequisite | corequisite | prohibition` cover every value observed
 * in the 2026 corpus. `permission | other` are kept as safety valves
 * for years/edge-cases we haven't surveyed.
 */
export const requisiteTypeEnum = pgEnum("requisite_type", [
  "prerequisite",
  "corequisite",
  "prohibition",
  "permission",
  "other",
]);

/* ------------------------------------------------------------------ *
 * Core entities
 * ------------------------------------------------------------------ */

export const units = pgTable(
  "units",
  {
    year: text().notNull(),
    code: text().notNull(),
    title: text().notNull(),
    creditPoints: integer(),
    /** Internal CourseLoop level code (e.g. "1", "2", "undergraduate"). */
    level: text(),
    /** Internal type code — kept as-is, not user-facing. */
    type: text(),
    status: text(),
    /** "Undergraduate" | "Postgraduate" | "Undergraduate and Postgraduate". */
    undergradPostgrad: text(),
    school: text(),
    academicOrg: text(),
    /** The main "what is this unit" description, HTML. */
    handbookSynopsis: text(),
    raw: jsonb().$type<UnitContent>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.year, t.code] }),
    index("units_title_idx").on(t.title),
    index("units_school_idx").on(t.school),
  ],
);

export const courses = pgTable(
  "courses",
  {
    year: text().notNull(),
    code: text().notNull(),
    title: text().notNull(),
    abbreviatedName: text(),
    /** AQF level code, e.g. "7_bach_deg". */
    aqfLevel: text(),
    creditPoints: integer(),
    type: text(),
    status: text(),
    school: text(),
    /** CRICOS code for international-student regulatory listing. */
    cricosCode: text(),
    /** The main "what is this course" description (`overview` field, HTML). */
    overview: text(),
    /**
     * Delivery mode flags. The scraped JSON already flattens `modes[]`
     * into these booleans (100% populated), so extracting them lets the
     * planner filter without parsing JSONB.
     */
    onCampus: boolean(),
    online: boolean(),
    fullTime: boolean(),
    partTime: boolean(),
    /** Requirement tree rendered on the course structure page. */
    curriculumStructure: jsonb().$type<CurriculumStructure>(),
    raw: jsonb().$type<CourseContent>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.year, t.code] }),
    index("courses_title_idx").on(t.title),
  ],
);

export const areasOfStudy = pgTable(
  "areas_of_study",
  {
    year: text().notNull(),
    code: text().notNull(),
    title: text().notNull(),
    /** "Undergraduate" | "Postgraduate" | "Honours" | "Research". */
    studyLevel: text(),
    creditPoints: integer(),
    school: text(),
    academicOrg: text(),
    handbookDescription: text(),
    curriculumStructure: jsonb().$type<CurriculumStructure>(),
    raw: jsonb().$type<AosContent>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.year, t.code] }),
    index("aos_title_idx").on(t.title),
  ],
);

/* ------------------------------------------------------------------ *
 * Relationships
 * ------------------------------------------------------------------ */

/**
 * One row per (unit × offering) — e.g. "FIT1045 | S1-2026 | Clayton |
 * On-campus". Drives planner-grid validation ("is this unit actually
 * available in this slot?") and the "what's offered Sem 1" view.
 */
export const unitOfferings = pgTable(
  "unit_offerings",
  {
    id: serial().primaryKey(),
    year: text().notNull(),
    unitCode: text().notNull(),
    name: text(),
    displayName: text(),
    teachingPeriod: text(),
    location: text(),
    attendanceMode: text(),
    offered: boolean().notNull().default(true),
  },
  (t) => [
    index("offerings_unit_idx").on(t.year, t.unitCode),
    index("offerings_slot_idx").on(t.year, t.teachingPeriod, t.location),
  ],
);

/**
 * One row per requisite block on a unit. `rule` keeps the structured
 * container tree (AND/OR groups over unit codes) — v1 renders
 * `description` verbatim; a later pass can interpret `rule` for
 * auto-validation ("can this student take FIT2004 yet?").
 */
export const requisites = pgTable(
  "requisites",
  {
    id: serial().primaryKey(),
    year: text().notNull(),
    unitCode: text().notNull(),
    requisiteType: requisiteTypeEnum().notNull(),
    description: text(),
    rule: jsonb(),
  },
  (t) => [index("requisites_unit_idx").on(t.year, t.unitCode)],
);

/**
 * Course → AoS links (majors / minors / specialisations of a degree).
 * Relationship is part of the composite PK so a course can legitimately
 * list the same AoS under multiple relationships.
 */
export const courseAreasOfStudy = pgTable(
  "course_areas_of_study",
  {
    courseYear: text().notNull(),
    courseCode: text().notNull(),
    aosYear: text().notNull(),
    aosCode: text().notNull(),
    relationship: text().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.courseYear, t.courseCode, t.aosYear, t.aosCode, t.relationship],
    }),
    index("course_aos_course_idx").on(t.courseYear, t.courseCode),
    index("course_aos_aos_idx").on(t.aosYear, t.aosCode),
  ],
);
