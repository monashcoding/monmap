/**
 * An allowlist sanitizer for the HTML that Monash's handbook (CourseLoop)
 * publishes: synopses, enrolment rules, overviews and the prose fields
 * inside `raw`. MonMap renders that HTML with dangerouslySetInnerHTML,
 * so anything active in it would run on our origin, which shares the
 * monashcoding.com sign-in.
 *
 * The handbook uses a small set of prose tags (p, br, lists, strong, em,
 * a, div, blockquote; a read of every HTML column in 2026-10 found
 * nothing else of note). Those tags are kept. Every attribute is dropped
 * except `href` on links (http, https, mailto or a relative URL) and
 * `colspan`/`rowspan` on table cells. Script-like elements are dropped
 * with their content; any other tag is dropped and its text kept. Text
 * is escaped, so the output can only hold the markup this file emits.
 *
 * No dependencies, so it runs in the browser too: links.ts calls it from
 * rewriteHandbookHtml, and links.ts is imported by client components.
 */

const ALLOWED = new Set([
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "strong",
  "b",
  "em",
  "i",
  "a",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "span",
  "div",
  "sup",
  "sub",
  "blockquote",
])

const VOID = new Set(["br"])

// Elements whose content must go too: their text is code, or a frame.
// `embed` and `img` are void, so dropping the tag drops them whole.
const DROP_WITH_CONTENT = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "noscript",
  "template",
  "textarea",
  "title",
  "xmp",
  "noembed",
  "noframes",
  "svg",
  "math",
  "select",
])

// One start or end tag, with quoted or bare attribute values. A `<`
// that does not start a well-formed tag is text and gets escaped.
const TAG =
  /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/y
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  colon: ":",
  tab: "\t",
  newline: "\n",
  sol: "/",
}

/** Decode the character references in an attribute value. */
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (whole, ref: string) => {
    if (ref[0] === "#") {
      const n =
        ref[1] === "x" || ref[1] === "X"
          ? parseInt(ref.slice(2), 16)
          : parseInt(ref.slice(1), 10)
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ""
    }
    return NAMED[ref.toLowerCase()] ?? whole
  })
}

/** Escape a value for a double-quoted attribute. */
export function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/** Escape text, keeping character references that are already there. */
function escapeText(s: string): string {
  return s
    .replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/**
 * The href to keep, decoded, or null to drop it. Browsers ignore
 * whitespace and control characters inside a scheme ("java\tscript:"),
 * so the scheme is read with those removed.
 */
export function safeHref(raw: string): string | null {
  const url = decodeEntities(raw).trim()
  if (!url) return null
  const probe = url.replace(/[\u0000- \u007f-\u009f]/g, "")
  // Protocol-relative URLs ("//host") would leave the site unmarked.
  if (probe.startsWith("//") || probe.startsWith("\\")) return null
  const scheme = probe.match(/^([a-z][a-z0-9+.-]*):/i)
  if (!scheme) return url
  return /^(https?|mailto)$/i.test(scheme[1]) ? url : null
}

function cleanAttrs(tag: string, attrs: string): string {
  let out = ""
  for (const m of attrs.matchAll(ATTR)) {
    const name = m[1].toLowerCase()
    const value = m[2] ?? m[3] ?? m[4] ?? ""
    if (tag === "a" && name === "href" && !out) {
      const href = safeHref(value)
      if (href !== null) out = ` href="${escapeAttr(href)}"`
    } else if (
      (tag === "td" || tag === "th") &&
      (name === "colspan" || name === "rowspan") &&
      /^\d{1,3}$/.test(value.trim())
    ) {
      out += ` ${name}="${Number(value)}"`
    }
  }
  return out
}

export function sanitizeHandbookHtml(html: string | null | undefined): string {
  if (!html) return ""
  let out = ""
  const open: string[] = []
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf("<", i)
    if (lt === -1) {
      out += escapeText(html.slice(i))
      break
    }
    out += escapeText(html.slice(i, lt))
    i = lt

    // Comments, doctypes, CDATA and processing instructions go.
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4)
      i = end === -1 ? html.length : end + 3
      continue
    }
    if (html[i + 1] === "!" || html[i + 1] === "?") {
      const end = html.indexOf(">", i)
      i = end === -1 ? html.length : end + 1
      continue
    }

    TAG.lastIndex = i
    const m = TAG.exec(html)
    if (!m) {
      out += "&lt;"
      i += 1
      continue
    }
    i = TAG.lastIndex
    const closing = m[1] === "/"
    const name = m[2].toLowerCase()

    if (DROP_WITH_CONTENT.has(name)) {
      if (closing) continue
      const close = new RegExp(`</${name}\\s*>`, "ig")
      close.lastIndex = i
      const end = close.exec(html)
      i = end ? close.lastIndex : html.length
      continue
    }
    if (!ALLOWED.has(name)) continue

    if (closing) {
      const at = open.lastIndexOf(name)
      if (at === -1) continue
      while (open.length > at) out += `</${open.pop()}>`
      continue
    }
    out += `<${name}${cleanAttrs(name, m[3])}>`
    if (!VOID.has(name)) open.push(name)
  }
  // Close what the source left open, so a fragment cannot swallow the
  // page around it.
  while (open.length > 0) out += `</${open.pop()}>`
  return out
}
