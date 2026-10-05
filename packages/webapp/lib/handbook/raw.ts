/**
 * Readers for the handbook fields that only exist inside the `raw`
 * JSONB of a unit, course or area of study. Every reader accepts any
 * value and returns empty output for a missing or odd shape: the raw
 * content is CourseLoop's, not ours, and varies by year.
 *
 * CourseLoop sends numbers and booleans as strings, and references
 * either as `{value, cl_id, key}` or `{label, value}` (see
 * docs/handbook-internals.md). `text()` reads all of those.
 */

type Obj = Record<string, unknown>

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function list(v: unknown): Obj[] {
  return Array.isArray(v) ? v.filter(isObj) : []
}

/** A display string from a scalar or a CourseLoop reference. */
export function text(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null
  if (typeof v === "number") return String(v)
  if (isObj(v)) return text(v.label) ?? text(v.value)
  return null
}

/** HTML prose, or null when it holds no visible text. */
export function html(v: unknown): string | null {
  if (typeof v !== "string") return null
  const visible = v
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;| /g, " ")
    .trim()
  return visible ? v.trim() : null
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function byNumber<T extends { n: number | null }>(a: T, b: T): number {
  return (a.n ?? 999) - (b.n ?? 999)
}

export interface LearningOutcome {
  code: string | null
  html: string
}

export function learningOutcomes(v: unknown): LearningOutcome[] {
  return list(v)
    .map((o) => ({
      n: num(o.number) ?? num(o.order),
      code: text(o.code),
      html: html(o.description),
    }))
    .filter((o): o is typeof o & { html: string } => o.html != null)
    .sort(byNumber)
    .map(({ code, html }) => ({ code, html }))
}

/** Names of the people in each contact role, without contact details. */
export interface ContactRole {
  role: string
  names: string[]
}

function contactName(c: Obj): string | null {
  return text(c.display_name) ?? text(c.contact_name) ?? text(c.user)
}

/** `academic_contact_roles`: `[{role, contacts: [...]}]`. */
export function contactRoles(v: unknown): ContactRole[] {
  return list(v)
    .map((r) => ({
      role: text(r.role) ?? "Contacts",
      names: [
        ...new Set(list(r.contacts).flatMap((c) => contactName(c) ?? [])),
      ],
    }))
    .filter((r) => r.names.length > 0)
}

/** A flat contact list (an AoS `academic_coordinator`), as one role. */
export function contactList(v: unknown, fallbackRole: string): ContactRole[] {
  const contacts = list(v)
  const names = [...new Set(contacts.flatMap((c) => contactName(c) ?? []))]
  if (names.length === 0) return []
  const role =
    text(contacts[0]?.display_role_plural) ??
    text(contacts[0]?.contact_role) ??
    fallbackRole
  return [{ role, names }]
}

/* ------------------------------------------------------------------ *
 * Units
 * ------------------------------------------------------------------ */

export interface Assessment {
  name: string
  type: string | null
  /** Percentage of the final mark, when the handbook gives one. */
  weight: number | null
  hurdle: string | null
}

export function assessments(v: unknown): Assessment[] {
  return list(v)
    .map((a) => ({
      n: num(a.number),
      name:
        text(a.name) ??
        text(a.assessment_name)?.replace(/^\d+\s*-\s*/, "") ??
        "Assessment",
      type: text(a.assessment_type),
      weight: num(a.weight),
      hurdle: text(a.hurdle_type),
    }))
    .sort(byNumber)
    .map(({ name, type, weight, hurdle }) => ({ name, type, weight, hurdle }))
}

export interface LearningActivity {
  type: string
  duration: string | null
}

/** `learning_activities_grouped`: scheduled activities and their hours. */
export function learningActivities(v: unknown): LearningActivity[] {
  return list(v).flatMap((g) =>
    list(g.activities).map((a) => ({
      type: text(a.activity_type) ?? text(g.activity_type) ?? "Activity",
      duration: text(a.duration_display),
    }))
  )
}

export interface ResourceGroup {
  type: string
  items: string[]
}

/** `learning_resources_grouped`: required and recommended resources. */
export function learningResources(v: unknown): ResourceGroup[] {
  return list(v)
    .map((g) => ({
      n: num(g.order),
      type: text(g.type) ?? "Resources",
      items: list(g.resources).flatMap((r) => html(r.description) ?? []),
    }))
    .filter((g) => g.items.length > 0)
    .sort(byNumber)
    .map(({ type, items }) => ({ type, items }))
}

export interface TeachingApproach {
  label: string
  html: string | null
}

export function teachingApproaches(v: unknown): TeachingApproach[] {
  return list(v)
    .map((t) => ({ label: text(t.type) ?? "", html: html(t.description) }))
    .filter((t) => t.label)
}

/** Labels from a list of references, minus "None". */
export function labels(v: unknown): string[] {
  return list(v)
    .flatMap((x) => text(x) ?? [])
    .filter((l) => l.toLowerCase() !== "none")
}

/* ------------------------------------------------------------------ *
 * Courses
 * ------------------------------------------------------------------ */

/** "3 Years" from `full_time_duration` / `part_time_duration`. */
export function duration(v: unknown): string | null {
  const first = list(v)[0]
  return first ? text(first.duration_display) : null
}

export interface CourseMode {
  mode: string
  locations: string[]
}

/** `modes`: delivery mode with the campuses it runs at. */
export function courseModes(v: unknown): CourseMode[] {
  return list(v)
    .map((m) => ({
      mode: text(m.mode) ?? "",
      locations: Array.isArray(m.locations)
        ? m.locations.flatMap((l) => text(l) ?? [])
        : [],
    }))
    .filter((m) => m.mode)
}

export function awardTitles(v: unknown): string[] {
  return [...new Set(list(v).flatMap((a) => text(a.award_title)?.trim() ?? []))]
}
