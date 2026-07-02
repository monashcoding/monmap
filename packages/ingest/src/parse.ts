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
import {
  extractRequirementGroups,
  extractEmbeddedSpecialisations,
  extractSubCourseRefs,
  extractComponentLabels,
  type ComponentLabelMap,
  type EmbeddedSpecialisation,
  type RequirementGroup,
  type SubCourseRef,
} from "@monmap/db";

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

/**
 * Some units (Science, Engineering, Pharmacy, Education — ~2,340 unit-years)
 * record their PREREQUISITE / PROHIBITION / CO-REQUISITE relationships as HTML
 * prose in `enrolment_rules` instead of the structured `requisites` tree, e.g.
 *   <p><strong>Prerequisite: </strong><a href=".../units/MTH1030">MTH1030</a></p>
 *   <p><strong>Prohibitions:</strong> <a href=".../units/MTH2015">MTH2015</a></p>
 * Pull the unit-code refs out so the graph edges and "what does X unlock"
 * views reflect reality.
 *
 * High-precision, anchor-based extraction:
 *  - Split each description at every `<strong>` label, so a description that
 *    carries several labels attributes each unit link to its OWN section
 *    rather than the whole blob (121 descriptions mix PREREQUISITE +
 *    PROHIBITION; a whole-blob classify would mislabel ~126 edges).
 *  - Take only `/units/CODE` anchors, across every handbook host the corpus
 *    uses (`handbook.monash.edu/<year>/units/` and the legacy
 *    `www[3].monash.edu/pubs/.../units/CODE.html`). `/courses/` and `/aos/`
 *    links in the same prose are ignored — unit edges only reference units.
 *  - Drop self-references (a unit listing itself, e.g. CHM3990's corequisite).
 *  - Plain-text codes with no anchor ("…or MTH1040") are deliberately NOT
 *    parsed: that needs NLP and would read course codes (4531, M6011) as units.
 *
 * Kept in lockstep with migration
 * `packages/db/drizzle/0007_backfill_enrolment_rule_refs.sql`.
 */
export function extractEnrolmentRuleRefs(
  year: string,
  unitCode: string,
  rules: ReadonlyArray<{ description: string | null }>,
): UnitRows["requisiteRefs"] {
  const out = new Map<string, UnitRows["requisiteRefs"][number]>();
  const selfCode = unitCode.toUpperCase();
  for (const rule of rules) {
    if (!rule.description) continue;
    for (const seg of rule.description.split(/(?=<strong)/i)) {
      const rType: RequisiteType | null = /^<strong[^>]*>\s*PREREQUISITE/i.test(
        seg,
      )
        ? "prerequisite"
        : /^<strong[^>]*>\s*PROHIBITION/i.test(seg)
          ? "prohibition"
          : /^<strong[^>]*>\s*CO-?REQUISITE/i.test(seg)
            ? "corequisite"
            : null;
      if (!rType) continue;
      const unitLinkRe = /\/units\/([A-Za-z][A-Za-z0-9]+)/g;
      let m: RegExpExecArray | null;
      while ((m = unitLinkRe.exec(seg)) !== null) {
        const upper = m[1]!.toUpperCase();
        if (upper === selfCode) continue; // drop self-references
        const key = `${rType}|${upper}`;
        if (!out.has(key)) {
          out.set(key, {
            year,
            unitCode,
            requisiteType: rType,
            requiresUnitCode: upper,
          });
        }
      }
    }
  }
  return [...out.values()];
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

  // Fold in the refs that some units record as HTML prose in enrolment_rules
  // instead of the structured requisites field (see extractEnrolmentRuleRefs).
  // Structured refs added above win on key collision; the two sources are
  // effectively disjoint in practice.
  for (const ref of extractEnrolmentRuleRefs(year, code, enrolmentRules)) {
    const key = `${ref.requisiteType}|${ref.requiresUnitCode}`;
    if (!refSet.has(key)) refSet.set(key, ref);
  }

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
    requirementGroups: RequirementGroup[] | null;
    embeddedSpecialisations: EmbeddedSpecialisation[] | null;
    subCourseRefs: SubCourseRef[] | null;
    componentLabels: ComponentLabelMap | null;
    raw: CourseContent;
  };
}

export function parseCourse(year: string, raw: CourseContent): CourseRows {
  const structure = raw.curriculumStructure ?? null;
  // Precompute curriculum-tree extractions once at ingest so the planner
  // never has to re-walk the tree at request time. See
  // packages/db/src/curriculum.ts for the walker implementations.
  const hasStructure = structure !== null;
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
      curriculumStructure: structure,
      requirementGroups: hasStructure
        ? extractRequirementGroups(structure, toInt(raw.credit_points) ?? 0)
        : null,
      embeddedSpecialisations: hasStructure
        ? extractEmbeddedSpecialisations(structure)
        : null,
      subCourseRefs: hasStructure ? extractSubCourseRefs(structure) : null,
      componentLabels: hasStructure ? extractComponentLabels(structure) : null,
      raw,
    },
  };
}

/**
 * Walk a course's curriculumStructure and return every AoS code it
 * references, paired with the **most-classifying** ancestor title and
 * its normalised `kind`.
 *
 * Monash sometimes nests campus splits ("Clayton", "Malaysia") inside
 * discipline-named Part containers ("Parts C, D and E. Engineering
 * specialisation…"). The nearest ancestor of an AoS reference is then
 * the campus name, which doesn't keyword-match any kind and gets
 * demoted to `"other"`. To fix that, we track every container title
 * on the path from root to leaf and pick the deepest one whose
 * `classifyAosRelationship` returns a non-"other" kind. If every
 * ancestor is opaque (rare), we fall back to the deepest title.
 *
 * Why the deepest *classifying* ancestor rather than depth-1: a Part
 * may contain *multiple* sub-categories that classify differently
 * (e.g. a part titled "Part C. Studies" containing "Specialist
 * studies" and "Elective units"). We want the most specific match.
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
  const walk = (node: unknown, ancestors: readonly string[]): void => {
    if (Array.isArray(node)) {
      for (const x of node) walk(x, ancestors);
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
    const childAncestors = title ? [...ancestors, title] : ancestors;
    for (const [, v] of Object.entries(n)) {
      if (typeof v === "string") {
        const upper = v.toUpperCase();
        if (aosCodes.has(upper)) {
          const { kind, label } = chooseClassifyingAncestor(childAncestors);
          const key = `${upper}|${label}`;
          if (!out.has(key)) {
            out.set(key, {
              courseYear,
              courseCode,
              aosYear: courseYear,
              aosCode: upper,
              kind,
              relationshipLabel: label,
            });
          }
        }
      } else {
        walk(v, childAncestors);
      }
    }
  };
  walk(curriculumStructure, []);
  return [...out.values()];
}

/**
 * Pick the deepest ancestor title whose `classifyAosRelationship`
 * returns a non-"other" kind. If every ancestor is opaque, fall back
 * to the deepest title (or "referenced" if the path is empty).
 */
function chooseClassifyingAncestor(
  ancestors: readonly string[],
): { kind: AosKind; label: string } {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const label = ancestors[i]!;
    const kind = classifyAosRelationship(label);
    if (kind !== "other") return { kind, label };
  }
  const fallback = ancestors.at(-1) ?? "referenced";
  return { kind: "other", label: fallback };
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
