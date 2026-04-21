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

/** Safe extraction of the display string from a CourseLoop CLReference. */
function clValue(ref: CLReference | undefined): string | null {
  const v = ref?.value;
  return v == null || v === "" ? null : v;
}

/**
 * Several fields come as `{label, value}` lite-references where `label`
 * is the human-readable form (e.g. "Level 1", "Bachelor Degree") and
 * `value` is the internal code. Prefer label; fall back to value.
 */
function labelOrValue(x: unknown): string | null {
  if (!x || typeof x !== "object") return null;
  const o = x as { label?: unknown; value?: unknown };
  if (typeof o.label === "string" && o.label !== "") return o.label;
  if (typeof o.value === "string" && o.value !== "") return o.value;
  return null;
}

/** Handbook stores credit points as strings like "6", "144"; empty → null. */
function toInt(s: unknown): number | null {
  if (typeof s !== "string" || s === "") return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** CourseLoop booleans are the strings "true" / "false". */
function toBool(s: unknown): boolean | null {
  if (s === true || s === "true") return true;
  if (s === false || s === "false") return false;
  return null;
}

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
    offered: boolean;
  }>;
  requisites: Array<{
    year: string;
    unitCode: string;
    requisiteType: "prerequisite" | "corequisite" | "prohibition" | "permission" | "other";
    description: string | null;
    rule: unknown;
  }>;
}

export function parseUnit(year: string, raw: UnitContent): UnitRows {
  const code = raw.code;
  const offerings = (raw.unit_offering ?? []).map((o: UnitOffering) => ({
    year,
    unitCode: code,
    name: o.name ?? null,
    displayName: o.display_name ?? null,
    teachingPeriod: clValue(o.teaching_period),
    location: clValue(o.location),
    attendanceMode: clValue(o.attendance_mode),
    offered: toBool(o.offered) ?? true,
  }));
  const requisites = (raw.requisites ?? []).map((r: Requisite) => ({
    year,
    unitCode: code,
    requisiteType: mapRequisiteType(clValue(r.requisite_type)),
    description: r.description || null,
    rule: r.container ?? null,
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
  };
}

function mapRequisiteType(v: string | null): UnitRows["requisites"][number]["requisiteType"] {
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

/**
 * Walk a course's curriculumStructure and return every AoS code it
 * references, paired with the nearest ancestor container's title (e.g.
 * "Part B. Major studies", "Discipline elective studies"). The title
 * gives the UI enough context to classify the reference without us
 * baking in Monash's curriculum taxonomy here.
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
  relationship: string;
}> {
  const out = new Map<string, {
    courseYear: string;
    courseCode: string;
    aosYear: string;
    aosCode: string;
    relationship: string;
  }>();

  const walk = (node: unknown, nearestTitle: string): void => {
    if (Array.isArray(node)) {
      for (const x of node) walk(x, nearestTitle);
      return;
    }
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    const title = typeof n["title"] === "string" ? n["title"] : typeof n["name"] === "string" ? n["name"] : null;
    const titleForChildren = title || nearestTitle;
    for (const [, v] of Object.entries(n)) {
      if (typeof v === "string") {
        const upper = v.toUpperCase();
        if (aosCodes.has(upper)) {
          const key = `${upper}|${titleForChildren}`;
          if (!out.has(key)) {
            out.set(key, {
              courseYear,
              courseCode,
              aosYear: courseYear,
              aosCode: upper,
              relationship: titleForChildren || "referenced",
            });
          }
        }
      } else {
        walk(v, titleForChildren);
      }
    }
  };
  walk(curriculumStructure, "");
  return [...out.values()];
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
