/**
 * Pure transforms from raw handbook JSON into row-shaped objects.
 *
 * No DB coupling here — every function is `raw → rows`, so tests can
 * pin shape without a database. The real `ingest.ts` wires these into
 * drizzle inserts.
 */

import type {
  AosContent,
  CLReference,
  CourseContent,
  CurriculumStructure,
  Requisite,
  UnitContent,
  UnitOffering,
} from "@monmap/scraper/types";

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function clValue(ref: CLReference | undefined): string | null {
  const v = ref?.value;
  return v == null || v === "" ? null : v;
}

/**
 * `{label, value}` lite-references: prefer label (human-readable), fall
 * back to value. Used for level, type, status, aqf_level etc.
 */
function labelOrValue(x: unknown): string | null {
  if (!x || typeof x !== "object") return null;
  const o = x as { label?: unknown; value?: unknown };
  if (typeof o.label === "string" && o.label !== "") return o.label;
  if (typeof o.value === "string" && o.value !== "") return o.value;
  return null;
}

function toInt(s: unknown): number | null {
  if (typeof s !== "string" || s === "") return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function toBool(s: unknown): boolean | null {
  if (s === true || s === "true") return true;
  if (s === false || s === "false") return false;
  return null;
}

type RequisiteType =
  | "prerequisite"
  | "corequisite"
  | "prohibition"
  | "permission"
  | "other";

function mapRequisiteType(v: string | null): RequisiteType {
  switch (v) {
    case "prerequisite":
    case "prerequisites":
      return "prerequisite";
    case "corequisite":
    case "corequisites":
      return "corequisite";
    case "prohibition":
    case "prohibitions":
      return "prohibition";
    case "permission":
    case "permissions":
      return "permission";
    default:
      return "other";
  }
}

type AosKind =
  | "major"
  | "extended_major"
  | "minor"
  | "specialisation"
  | "elective"
  | "other";

/**
 * Classify a course→AoS relationship from its ancestor container
 * title. Monash uses strings like "Part B. Major studies", "Science
 * extended majors", "Engineering specialisations", "Discipline
 * elective studies". We do keyword matching; unknown labels map to
 * "other". The original label is preserved separately for display.
 */
function classifyAosRelationship(label: string): AosKind {
  const l = label.toLowerCase();
  if (l.includes("extended major")) return "extended_major";
  if (l.includes("specialisation") || l.includes("specialization") || l.includes("specialist"))
    return "specialisation";
  if (l.includes("minor")) return "minor";
  if (l.includes("elective")) return "elective";
  if (l.includes("major")) return "major";
  return "other";
}

/**
 * Extract the canonical attendance-mode code from the verbose source
 * string. Example: "Teaching activities are on-campus (ON-CAMPUS)" →
 * "ON-CAMPUS". Returns null if no parenthetical code is present.
 */
function extractAttendanceModeCode(verbose: string | null): string | null {
  if (!verbose) return null;
  const m = verbose.match(/\(([A-Z][A-Z0-9-]*)\)/);
  return m ? m[1]! : null;
}

/* ------------------------------------------------------------------ *
 * Unit-tree walker — collects academic_item_code references.
 *
 * Used by both `requisites.rule` (container → containers → relationships)
 * and AoS/course curriculumStructure walks, since they share the same
 * shape: a recursive container tree whose leaves are `relationships[]`
 * with `academic_item_code` fields.
 * ------------------------------------------------------------------ */

export interface CodeRef {
  code: string;
  /** `academic_item_type.value` — typically "subject" (unit) or "course". */
  type: string | null;
  /** Nearest ancestor container title — useful for grouping. */
  ancestor: string | null;
}

export function collectCodeRefs(root: unknown): CodeRef[] {
  const out: CodeRef[] = [];
  const walk = (node: unknown, ancestor: string | null): void => {
    if (Array.isArray(node)) {
      for (const x of node) walk(x, ancestor);
      return;
    }
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;

    // Container-ish nodes carry a `title` or `name` that labels any
    // leaves nested beneath them. Unit requisites use "relationships"
    // (plural), AoS trees use "relationship" (singular); rather than
    // special-case the key, we treat *any* object with an
    // `academic_item_code` field as a leaf and recurse into everything
    // else.
    const title =
      typeof n["title"] === "string"
        ? n["title"]
        : typeof n["name"] === "string"
          ? (n["name"] as string)
          : null;
    const childAncestor = title || ancestor;

    const code = n["academic_item_code"];
    if (typeof code === "string") {
      const typeRef = n["academic_item_type"];
      // .value is the internal code ("subject" / "course" / ...), not
      // .label ("Unit" / ...). Consumers filter on the code.
      out.push({
        code,
        type: clValue(typeRef as CLReference | undefined),
        ancestor: childAncestor,
      });
    }
    for (const v of Object.values(n)) walk(v, childAncestor);
  };
  walk(root, null);
  return out;
}

/* ------------------------------------------------------------------ *
 * Units
 * ------------------------------------------------------------------ */

export interface UnitRows {
  unit: {
    year: string;
    code: string;
    title: string;
    creditPoints: number | null;
    level: string | null;
    type: string | null;
    status: string | null;
    undergradPostgrad: string | null;
    school: string | null;
    academicOrg: string | null;
    handbookSynopsis: string | null;
    raw: UnitContent;
  };
  offerings: Array<{
    year: string;
    unitCode: string;
    name: string | null;
    displayName: string | null;
    teachingPeriod: string | null;
    location: string | null;
    attendanceMode: string | null;
    attendanceModeCode: string | null;
    offered: boolean;
  }>;
  requisites: Array<{
    year: string;
    unitCode: string;
    requisiteType: RequisiteType;
    description: string | null;
    rule: unknown;
  }>;
  requisiteRefs: Array<{
    year: string;
    unitCode: string;
    requisiteType: RequisiteType;
    requiresUnitCode: string;
  }>;
  enrolmentRules: Array<{
    year: string;
    unitCode: string;
    ruleType: string | null;
    description: string | null;
  }>;
}

export function parseUnit(year: string, raw: UnitContent): UnitRows {
  const code = raw.code;

  const offerings = (raw.unit_offering ?? []).map((o: UnitOffering) => {
    const verbose = clValue(o.attendance_mode);
    return {
      year,
      unitCode: code,
      name: o.name ?? null,
      displayName: o.display_name ?? null,
      teachingPeriod: clValue(o.teaching_period),
      location: clValue(o.location),
      attendanceMode: verbose,
      attendanceModeCode: extractAttendanceModeCode(verbose),
      offered: toBool(o.offered) ?? true,
    };
  });

  const reqs = raw.requisites ?? [];
  const requisites = reqs.map((r: Requisite) => ({
    year,
    unitCode: code,
    requisiteType: mapRequisiteType(clValue(r.requisite_type)),
    description: r.description || null,
    rule: r.container ?? null,
  }));

  const refSet = new Map<string, UnitRows["requisiteRefs"][number]>();
  for (const r of reqs) {
    const rType = mapRequisiteType(clValue(r.requisite_type));
    for (const ref of collectCodeRefs(r.container)) {
      if (ref.type !== "subject") continue;
      const upper = ref.code.toUpperCase();
      const key = `${rType}|${upper}`;
      if (!refSet.has(key)) {
        refSet.set(key, {
          year,
          unitCode: code,
          requisiteType: rType,
          requiresUnitCode: upper,
        });
      }
    }
  }

  const enrolmentRules = (
    (raw["enrolment_rules"] as unknown as Array<Record<string, unknown>>) ?? []
  ).map((e) => ({
    year,
    unitCode: code,
    ruleType: labelOrValue(e["type"]),
    description:
      typeof e["description"] === "string" ? (e["description"] as string) : null,
  }));

  return {
    unit: {
      year,
      code,
      title: raw.title,
      creditPoints: toInt(raw.credit_points),
      level: labelOrValue(raw.level),
      type: labelOrValue(raw.type),
      status: labelOrValue(raw.status),
      undergradPostgrad: clValue(raw["undergrad_postgrad_both"] as CLReference | undefined),
      school: clValue(raw.school),
      academicOrg: clValue(raw.academic_org),
      handbookSynopsis: (raw.handbook_synopsis as string | undefined) || null,
      raw,
    },
    offerings,
    requisites,
    requisiteRefs: [...refSet.values()],
    enrolmentRules,
  };
}

/* ------------------------------------------------------------------ *
 * Courses
 * ------------------------------------------------------------------ */

export interface CourseRows {
  course: {
    year: string;
    code: string;
    title: string;
    abbreviatedName: string | null;
    aqfLevel: string | null;
    creditPoints: number | null;
    type: string | null;
    status: string | null;
    school: string | null;
    cricosCode: string | null;
    overview: string | null;
    onCampus: boolean | null;
    online: boolean | null;
    fullTime: boolean | null;
    partTime: boolean | null;
    curriculumStructure: CurriculumStructure | null;
    raw: CourseContent;
  };
}

export function parseCourse(year: string, raw: CourseContent): CourseRows {
  return {
    course: {
      year,
      code: raw.code,
      title: raw.title,
      abbreviatedName: (raw.abbreviated_name as string | undefined) || null,
      aqfLevel: labelOrValue(raw.aqf_level),
      creditPoints: toInt(raw.credit_points),
      type: labelOrValue(raw.type),
      status: labelOrValue(raw.status),
      school: clValue(raw.school),
      cricosCode: (raw["cricos_code"] as string | undefined) || null,
      overview: (raw["overview"] as string | undefined) || null,
      onCampus: toBool(raw["on_campus"]),
      online: toBool(raw["online"]),
      fullTime: toBool(raw["full_time"]),
      partTime: toBool(raw["part_time"]),
      curriculumStructure: raw.curriculumStructure ?? null,
      raw,
    },
  };
}

/**
 * Walk a course's curriculumStructure and return every AoS code it
 * references, paired with the nearest ancestor container title (e.g.
 * "Part B. Major studies", "Discipline elective studies") and a
 * normalised `kind` classification.
 *
 * Uses string-matching against the known AoS code set rather than
 * `academic_item_type` because courses reference AoSes via freeform
 * strings inside container titles and descriptions as well as formal
 * relationships[] leaves.
 */
export function extractCourseAosRefs(
  courseYear: string,
  courseCode: string,
  curriculumStructure: unknown,
  aosCodes: ReadonlySet<string>,
): Array<{
  courseYear: string;
  courseCode: string;
  aosYear: string;
  aosCode: string;
  kind: AosKind;
  relationshipLabel: string;
}> {
  const out = new Map<
    string,
    {
      courseYear: string;
      courseCode: string;
      aosYear: string;
      aosCode: string;
      kind: AosKind;
      relationshipLabel: string;
    }
  >();
  const walk = (node: unknown, ancestor: string): void => {
    if (Array.isArray(node)) {
      for (const x of node) walk(x, ancestor);
      return;
    }
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    const title =
      typeof n["title"] === "string"
        ? n["title"]
        : typeof n["name"] === "string"
          ? (n["name"] as string)
          : null;
    const childAncestor = title || ancestor;
    for (const [, v] of Object.entries(n)) {
      if (typeof v === "string") {
        const upper = v.toUpperCase();
        if (aosCodes.has(upper)) {
          const label = childAncestor || "referenced";
          const key = `${upper}|${label}`;
          if (!out.has(key)) {
            out.set(key, {
              courseYear,
              courseCode,
              aosYear: courseYear,
              aosCode: upper,
              kind: classifyAosRelationship(label),
              relationshipLabel: label,
            });
          }
        }
      } else {
        walk(v, childAncestor);
      }
    }
  };
  walk(curriculumStructure, "");
  return [...out.values()];
}

/* ------------------------------------------------------------------ *
 * Areas of Study
 * ------------------------------------------------------------------ */

export interface AosRows {
  aos: {
    year: string;
    code: string;
    title: string;
    studyLevel: string | null;
    creditPoints: number | null;
    school: string | null;
    academicOrg: string | null;
    handbookDescription: string | null;
    curriculumStructure: CurriculumStructure | null;
    raw: AosContent;
  };
}

export function parseAos(year: string, raw: AosContent): AosRows {
  return {
    aos: {
      year,
      code: raw.code,
      title: raw.title,
      studyLevel: clValue(raw["undergrad_postgrad"] as CLReference | undefined),
      creditPoints: toInt(raw.credit_points),
      school: clValue(raw.school),
      academicOrg: clValue(raw.academic_org),
      handbookDescription: (raw.handbook_description as string | undefined) || null,
      curriculumStructure: raw.curriculumStructure ?? null,
      raw,
    },
  };
}

/**
 * Walk an AoS curriculumStructure and emit one row per (unit code,
 * grouping) pair. Grouping is the nearest ancestor container title —
 * "Core units", "Elective units", "Malaysia", "Peninsula", etc.
 *
 * Unlike `extractCourseAosRefs` we use formal `academic_item_code`
 * refs (via `collectCodeRefs`) because AoS trees consistently place
 * unit codes inside `relationships[]`.
 */
export function extractAosUnitRefs(
  aosYear: string,
  aosCode: string,
  curriculumStructure: unknown,
  unitCodes: ReadonlySet<string>,
): Array<{
  aosYear: string;
  aosCode: string;
  unitCode: string;
  grouping: string;
}> {
  const out = new Map<string, {
    aosYear: string;
    aosCode: string;
    unitCode: string;
    grouping: string;
  }>();
  for (const ref of collectCodeRefs(curriculumStructure)) {
    if (ref.type !== "subject") continue;
    const upper = ref.code.toUpperCase();
    if (!unitCodes.has(upper)) continue;
    const grouping = ref.ancestor || "root";
    const key = `${upper}|${grouping}`;
    if (!out.has(key)) {
      out.set(key, { aosYear, aosCode, unitCode: upper, grouping });
    }
  }
  return [...out.values()];
}
