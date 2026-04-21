/**
 * Monmap handbook schema.
 *
 * Shape decisions:
 *   1. Composite PK (year, code) on every entity. Handbook data is year-
 *      scoped and the same code yields different content across years.
 *   2. Hybrid normalize + JSONB. Fields that queries actually hit get
 *      real columns; the recursive/detail-only trees (curriculumStructure,
 *      assessments, unit_learning_outcomes, workload_requirements) ride
 *      through as JSONB inside `raw`.
 *   3. `raw` holds the full pageContent verbatim — forward-compat escape
 *      hatch so downstream adapters can reach for fields we haven't
 *      normalised yet.
 *   4. Snake-case DB, camelCase TS via `casing: "snake_case"` in
 *      drizzle.config.ts.
 *   5. For graph-shaped data (requisites, AoS↔unit, course↔AoS) we keep
 *      the authoritative rule tree in JSONB **and** emit a flat edge
 *      table alongside. The JSONB is for evaluation semantics (AND/OR);
 *      the flat table is for fast indexed forward/reverse lookups.
 *   6. No FKs between join tables and entity tables — scraped data has
 *      dangling refs (units reference historical-year versions of other
 *      units) and we accept that.
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

/**
 * Classification of a course → AoS relationship. Inferred at ingest
 * time by keyword-matching the ancestor container title
 * (`relationship_label`). Original label is preserved verbatim for
 * display fidelity — this enum is for filtering only.
 */
export const aosRelationshipKindEnum = pgEnum("aos_relationship_kind", [
  "major",
  "extended_major",
  "minor",
  "specialisation",
  "elective",
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
    /** Human-readable level, e.g. "Level 1". */
    level: text(),
    /** Human-readable type, e.g. "Coursework". */
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
    /** Human-readable AQF level, e.g. "Level 7 - Bachelor Degree". */
    aqfLevel: text(),
    creditPoints: integer(),
    type: text(),
    status: text(),
    school: text(),
    cricosCode: text(),
    /** The main "what is this course" description (`overview` field). */
    overview: text(),
    /** Top-level delivery mode flags, already parsed in the source. */
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
 * Unit children — offerings, requisites (tree), requisite refs (edges),
 * enrolment rules
 * ------------------------------------------------------------------ */

/**
 * One row per (unit × offering) — e.g. "FIT1045 | S1-2026 | Clayton |
 * On-campus". Drives the planner-grid validation ("is this unit actually
 * available in this slot?") and the "what's offered Sem 1" view.
 *
 * `attendanceModeCode` is the canonical short code extracted from the
 * verbose `attendanceMode` string (e.g. "ON-CAMPUS", "ONLINE",
 * "BLENDED") — use this for filtering, the verbose string for display.
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
    attendanceModeCode: text(),
    offered: boolean().notNull().default(true),
  },
  (t) => [
    index("offerings_unit_idx").on(t.year, t.unitCode),
    index("offerings_slot_idx").on(t.year, t.teachingPeriod, t.location),
    index("offerings_mode_idx").on(t.attendanceModeCode),
  ],
);

/**
 * One row per requisite *block* on a unit. `rule` keeps the authoritative
 * AND/OR tree for evaluation ("does the student's set of completed
 * units satisfy this?"). For fast graph queries, see `requisiteRefs`.
 *
 * NB `description` is empty 99.9% of the time in Monash's data — render
 * from `rule` not `description` for human-facing output.
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
 * Flattened requisite edges. For each unit referenced anywhere inside a
 * unit's requisite rule tree, emit one row. Lets us answer the two
 * planner questions quickly:
 *   - Forward: "what does FIT2004 require?"  WHERE unit_code='FIT2004'
 *   - Reverse: "what requires FIT1045?"      WHERE requires_unit_code='FIT1045'
 *
 * Loses AND/OR semantics by design — use `requisites.rule` for correct
 * prereq-satisfaction checks.
 */
export const requisiteRefs = pgTable(
  "requisite_refs",
  {
    year: text().notNull(),
    unitCode: text().notNull(),
    requisiteType: requisiteTypeEnum().notNull(),
    /** The code of the unit this requisite references. */
    requiresUnitCode: text().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.year, t.unitCode, t.requisiteType, t.requiresUnitCode],
    }),
    index("requisite_refs_forward_idx").on(t.year, t.unitCode),
    index("requisite_refs_reverse_idx").on(t.year, t.requiresUnitCode),
  ],
);

/**
 * Program-level constraints that aren't expressible as "you must have
 * taken X": e.g. "must be enrolled in Bachelor of IT", "must have 48cp
 * in any degree owned by Art, Design and Architecture". Monash ships
 * these as HTML prose — no structured tree.
 */
export const enrolmentRules = pgTable(
  "enrolment_rules",
  {
    id: serial().primaryKey(),
    year: text().notNull(),
    unitCode: text().notNull(),
    /** Subcategory label, e.g. "Enrolment Rule". */
    ruleType: text(),
    /** HTML prose rendered verbatim. */
    description: text(),
  },
  (t) => [index("enrolment_rules_unit_idx").on(t.year, t.unitCode)],
);

/* ------------------------------------------------------------------ *
 * Cross-entity relationships
 * ------------------------------------------------------------------ */

/**
 * Course → AoS links (majors / minors / specialisations of a degree).
 * Populated by walking each course's curriculumStructure and classifying
 * every AoS code reference by its nearest ancestor container title.
 *
 *   kind               — normalized classification for filtering
 *   relationshipLabel  — original ancestor title (display fidelity)
 */
export const courseAreasOfStudy = pgTable(
  "course_areas_of_study",
  {
    courseYear: text().notNull(),
    courseCode: text().notNull(),
    aosYear: text().notNull(),
    aosCode: text().notNull(),
    kind: aosRelationshipKindEnum().notNull(),
    relationshipLabel: text().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [
        t.courseYear,
        t.courseCode,
        t.aosYear,
        t.aosCode,
        t.relationshipLabel,
      ],
    }),
    index("course_aos_course_idx").on(t.courseYear, t.courseCode),
    index("course_aos_aos_idx").on(t.aosYear, t.aosCode),
    index("course_aos_kind_idx").on(t.courseYear, t.courseCode, t.kind),
  ],
);

/**
 * AoS → unit edges. For each unit referenced anywhere in an AoS's
 * curriculumStructure, emit one row. Drives:
 *   - "what units count toward the Data Science major?"
 *     → WHERE aos_code='DATASCI04'
 *   - "which majors/minors does this unit belong to?"
 *     → WHERE unit_code='FIT1045'
 *
 * `grouping` captures the nearest ancestor title (e.g. "Core units",
 * "Malaysia", "Elective units") so the UI can section the list without
 * re-walking the raw tree.
 */
export const areaOfStudyUnits = pgTable(
  "area_of_study_units",
  {
    aosYear: text().notNull(),
    aosCode: text().notNull(),
    unitCode: text().notNull(),
    grouping: text().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.aosYear, t.aosCode, t.unitCode, t.grouping],
    }),
    index("aos_units_aos_idx").on(t.aosYear, t.aosCode),
    index("aos_units_unit_idx").on(t.unitCode),
  ],
);
