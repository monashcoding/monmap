/**
 * The kinds of area of study. Pure, with no database imports, so
 * client components and node tests can use it.
 */
import type { PlannerAreaOfStudy } from "../planner/types.ts"

export type AosKind = PlannerAreaOfStudy["kind"]

export interface AosKindInfo {
  id: AosKind
  /** Badges and fact rows: "Major". */
  label: string
  /** Headings over a list of them: "Majors". */
  plural: string
  /** Lowercase prose, one and many: "major", "majors". */
  word: readonly [string, string]
  /** Chips where space is tight: "Ext major". */
  short: string
}

/** Every kind, in the order pages list them. */
export const AOS_KINDS: readonly AosKindInfo[] = [
  {
    id: "major",
    label: "Major",
    plural: "Majors",
    word: ["major", "majors"],
    short: "Major",
  },
  {
    id: "extended_major",
    label: "Extended major",
    plural: "Extended majors",
    word: ["extended major", "extended majors"],
    short: "Ext major",
  },
  {
    id: "specialisation",
    label: "Specialisation",
    plural: "Specialisations",
    word: ["specialisation", "specialisations"],
    short: "Spec",
  },
  {
    id: "minor",
    label: "Minor",
    plural: "Minors",
    word: ["minor", "minors"],
    short: "Minor",
  },
  {
    // The handbook groups these under "Elective studies".
    id: "elective",
    label: "Elective",
    plural: "Elective studies",
    word: ["elective stream", "elective streams"],
    short: "Elective",
  },
  {
    id: "other",
    label: "Area of study",
    plural: "Other areas of study",
    word: ["area of study", "areas of study"],
    short: "Other",
  },
]

const BY_ID = new Map<string, AosKindInfo>(AOS_KINDS.map((k) => [k.id, k]))

/** The kind's entry, or null for a missing or unknown kind. */
export function aosKind(kind: string | null | undefined): AosKindInfo | null {
  return (kind && BY_ID.get(kind)) || null
}

/** "Major", or "Area of study" when the kind is missing or unknown. */
export function aosKindLabel(kind: string | null | undefined): string {
  return aosKind(kind)?.label ?? "Area of study"
}

/** "major" for prose, or "area of study" when the kind is unknown. */
export function aosKindWord(kind: string | null | undefined): string {
  return aosKind(kind)?.word[0] ?? "area of study"
}

/**
 * The 2027 handbook names AoS codes by kind (DASC-MAJ, DASC-MIN,
 * ALSO-USPEC). Used only when no course link says the kind, such as a
 * minor that courses list under "Elective studies".
 */
export function kindFromCode(code: string): AosKind | null {
  if (/-E(X)?MAJ$/i.test(code)) return "extended_major"
  if (/-MAJ$/i.test(code)) return "major"
  if (/-MIN$/i.test(code)) return "minor"
  if (/SPEC$/i.test(code)) return "specialisation"
  return null
}
