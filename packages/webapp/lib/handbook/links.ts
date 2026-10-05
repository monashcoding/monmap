/**
 * URLs for the handbook pages: /units/[code], /courses/[code] and
 * /aos/[code], each with an optional /[year] segment. The bare URL
 * shows the entity's latest handbook year and is the canonical one;
 * the year segment pins an earlier year.
 *
 * The segment names copy handbook.monash.edu, so swapping the domain
 * on a Monash link gives the matching MonMap page.
 */

export type EntityKind = "unit" | "course" | "aos"

export const ENTITY_SEGMENT: Record<EntityKind, string> = {
  unit: "units",
  course: "courses",
  aos: "aos",
}

export const ENTITY_LABEL: Record<EntityKind, string> = {
  unit: "Unit",
  course: "Course",
  aos: "Area of study",
}

/**
 * The page for one entity. Pass `year` only when the link must stay in
 * that handbook year; a null year links the latest version.
 */
export function entityHref(
  kind: EntityKind,
  code: string,
  year?: string | null
): string {
  const base = `/${ENTITY_SEGMENT[kind]}/${encodeURIComponent(code.toUpperCase())}`
  return year ? `${base}/${year}` : base
}

/** The same entity's page on handbook.monash.edu. */
export function monashHandbookUrl(
  kind: EntityKind,
  code: string,
  year: string
): string {
  return `https://handbook.monash.edu/${year}/${ENTITY_SEGMENT[kind]}/${code}`
}

const SEGMENT_KIND: Record<string, EntityKind> = {
  units: "unit",
  courses: "course",
  aos: "aos",
}

// handbook.monash.edu/2026/units/FIT1008, or the path alone
// (/2026/units/FIT1008), which is how curriculum leaves store it.
const HANDBOOK_PATH =
  /^(?:https?:\/\/handbook\.monash\.edu)?\/(?:current|\d{4})\/(units|courses|aos)\/([A-Za-z0-9]+)\/?(?:[?#].*)?$/i
// The legacy host: www.monash.edu/pubs/2019handbooks/units/MTH1030.html
const LEGACY_PATH =
  /^https?:\/\/(?:www\.)?monash\.edu(?:\.au)?\/pubs\/[^/]*handbooks?\/(units|courses|aos)\/([A-Za-z0-9]+)\.html/i

/**
 * The MonMap page for a handbook link, or null when the link is not a
 * unit, course or area of study page. Monash freezes cross-references
 * at the year they were approved (a 2026 unit links /2021/units/FIT1008),
 * so the link's own year is dropped and `linkYear` is used instead.
 */
export function handbookLinkToHref(
  url: string,
  linkYear: string | null
): string | null {
  const m = url.trim().match(HANDBOOK_PATH) ?? url.trim().match(LEGACY_PATH)
  if (!m) return null
  const kind = SEGMENT_KIND[m[1].toLowerCase()]
  return kind ? entityHref(kind, m[2], linkYear) : null
}

/**
 * Point the handbook links inside Monash's HTML prose at MonMap pages,
 * so a prerequisite named in an enrolment rule opens its MonMap page.
 * Other links are kept, and open in a new tab.
 */
export function rewriteHandbookHtml(
  html: string | null | undefined,
  linkYear: string | null
): string {
  if (!html) return ""
  return html.replace(/<a\b([^>]*)>/gi, (tag, attrs: string) => {
    const href = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/i)
    const url = href ? (href[2] ?? href[3] ?? "") : ""
    const internal = url ? handbookLinkToHref(url, linkYear) : null
    if (internal) return `<a href="${internal}">`
    if (/^mailto:/i.test(url)) return `<a href="${url}">`
    if (!url) return tag
    return `<a href="${url.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">`
  })
}
