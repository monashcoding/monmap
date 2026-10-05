/**
 * Plain-language summaries of a unit, course or area of study, built
 * from MonMap's own data: ratings and reviews, the requisite graph,
 * offerings and the course and major structure. They give every page
 * text that handbook.monash.edu doesn't have, so search engines see a
 * page of its own rather than a copy of the handbook, and they answer
 * the questions students search for ("Is FIT2004 hard?", "What does
 * FIT1045 unlock?").
 *
 * Everything here is pure: callers gather the facts, these functions
 * word them. A question is only asked when the data answers it, so no
 * page gets filler.
 */
import type { EntityKind } from "./links.ts"
import type { RequisiteContainer } from "../planner/types.ts"

/** A piece of text, or a link to a unit, course or area of study. */
export type Seg = string | { kind: EntityKind; code: string; text?: string }

export interface QA {
  id: string
  question: string
  answer: Seg[]
}

export interface RatingFacts {
  average: number | null
  count: number
  /** Mean and count per axis id. */
  axes: Record<string, { average: number; count: number }>
  /** Reviews per star, index 0 is 1 star. */
  distribution: number[]
}

/* ------------------------------------------------------------------ *
 * Wording helpers
 * ------------------------------------------------------------------ */

const unit = (code: string): Seg => ({ kind: "unit", code })

/** "A", "A and B", "A, B and C". */
export function joinSegs(items: Seg[][], conj: "and" | "or"): Seg[] {
  // Names that contain "and" themselves (double degrees) need
  // semicolons between them to stay readable.
  const hasAnd = items.some((item) => / and /.test(plain(item)))
  const out: Seg[] = []
  items.forEach((item, i) => {
    if (i > 0) {
      out.push(
        i === items.length - 1
          ? hasAnd
            ? `; ${conj} `
            : ` ${conj} `
          : hasAnd
            ? "; "
            : ", "
      )
    }
    out.push(...item)
  })
  return out
}

export function joinWords(items: string[], conj: "and" | "or" = "and"): string {
  return joinSegs(
    items.map((i) => [i]),
    conj
  ).join("")
}

/** Segments as plain text, codes standing in for links. */
export function plain(segs: Seg[]): string {
  return segs
    .map((s) => (typeof s === "string" ? s : (s.text ?? s.code)))
    .join("")
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-AU")} ${n === 1 ? one : many}`

export const ratingText = (r: RatingFacts) =>
  `${(r.average ?? 0).toFixed(1)} out of 5 from ${plural(r.count, "review")}`

const SCALE_WORDS: Record<string, readonly string[]> = {
  difficulty: ["very easy", "easy", "moderate", "hard", "very hard"],
  workload: ["very light", "light", "moderate", "heavy", "very heavy"],
}

/** "hard" for a mean difficulty of 3.9, or null with no ratings. */
export function scaleWord(r: RatingFacts, axis: string): string | null {
  const a = r.axes[axis]
  const words = SCALE_WORDS[axis]
  if (!a || a.count === 0 || !words) return null
  return words[Math.min(4, Math.max(0, Math.round(a.average) - 1))]
}

/**
 * A requisite rule tree as words: "FIT1008 or FIT1054, and MAT1830".
 * Top-level groups join with "and", as the handbook means them. Returns
 * null when the rule names no units.
 */
export function ruleSegs(rule: RequisiteContainer[] | null): Seg[] | null {
  // Each group words itself; `compound` says whether it needs brackets
  // when it sits inside another group.
  type Part = { segs: Seg[]; compound: boolean }
  const walk = (c: RequisiteContainer): Part | null => {
    const any = (c.parent_connector?.value ?? "AND").toUpperCase() === "OR"
    const parts: Part[] = [
      ...(c.relationships ?? []).map((l) => ({
        segs: [unit(l.academic_item_code)],
        compound: false,
      })),
      ...(c.containers ?? []).flatMap((sub) => walk(sub) ?? []),
    ]
    if (parts.length === 0) return null
    // A box holding one group is that group.
    if (parts.length === 1) return parts[0]
    return {
      segs: joinSegs(
        parts.map((p) => (p.compound ? ["(", ...p.segs, ")"] : p.segs)),
        any ? "or" : "and"
      ),
      compound: true,
    }
  }
  const top = (rule ?? []).flatMap((c) => walk(c) ?? [])
  if (top.length === 0) return null
  if (top.length === 1) return top[0].segs
  return joinSegs(
    top.map((p) => (p.compound ? ["(", ...p.segs, ")"] : p.segs)),
    "and"
  )
}

/* ------------------------------------------------------------------ *
 * Units
 * ------------------------------------------------------------------ */

export interface UnitFacts {
  code: string
  title: string
  year: string
  creditPoints: number
  level: number | null
  /** "Undergraduate" or "Postgraduate". */
  study: string | null
  school: string | null
  /** "Semester 1", "Semester 2", ... for the page's year. */
  periods: string[]
  campuses: string[]
  /** Online-only offerings, as a hint. */
  online: boolean
  prerequisites: RequisiteContainer[] | null
  corequisites: RequisiteContainer[] | null
  hasEnrolmentRules: boolean
  /** Units that list this one as a prerequisite or corequisite. */
  unlocks: string[]
  /** Units reachable through unlocks, up to four steps on. */
  leadsTo: number
  /** Exam weight in %, 0 for an exam without a weight, null for none. */
  examWeight: number | null
  assessmentCount: number
  /** Total hours for the semester, when the handbook gives one. */
  workloadHours: number | null
  areasOfStudy: Array<{ code: string; title: string }>
  rating: RatingFacts
}

/** Two or three sentences for the top of a unit page. */
export function unitLede(f: UnitFacts): Seg[] {
  const out: Seg[] = []
  const what = [
    f.level ? `level ${f.level}` : null,
    `${f.creditPoints}-credit-point`,
    f.study?.toLowerCase(),
  ]
    .filter(Boolean)
    .join(", ")
  out.push(
    `${f.code} ${f.title} is a ${what} unit${f.school ? ` from the ${f.school}` : ""}`
  )
  if (f.periods.length > 0) {
    out.push(
      `, offered in ${f.year} in ${joinWords(f.periods)}${
        f.campuses.length > 0
          ? ` at ${joinWords(f.campuses.slice(0, 3))}${f.campuses.length > 3 ? " and other campuses" : ""}`
          : ""
      }.`
    )
  } else {
    out.push(`. It isn't offered in ${f.year}.`)
  }

  const pre = ruleSegs(f.prerequisites)
  if (pre) out.push(" It needs ", ...pre)
  else out.push(" It has no prerequisites")
  if (f.unlocks.length > 0) {
    out.push(
      ` and unlocks ${plural(f.unlocks.length, "unit")}${
        f.leadsTo > f.unlocks.length
          ? `, leading on to ${plural(f.leadsTo, "unit")} in all`
          : ""
      }.`
    )
  } else out.push(".")

  if (f.rating.count > 0) {
    const diff = scaleWord(f.rating, "difficulty")
    out.push(
      ` Students rate it ${ratingText(f.rating)}${diff ? ` and call it ${diff}` : ""}.`
    )
  }
  return out
}

/** The questions a unit page answers, only those the data can answer. */
export function unitQuestions(f: UnitFacts): QA[] {
  const qs: QA[] = []
  const c = f.code

  const pre = ruleSegs(f.prerequisites)
  const co = ruleSegs(f.corequisites)
  qs.push({
    id: "prerequisites",
    question: `What are the prerequisites for ${c}?`,
    answer: pre
      ? [
          "You need ",
          ...pre,
          " before you enrol",
          ...(co ? ["; and ", ...co, " before or alongside it"] : []),
          ".",
          ...(f.hasEnrolmentRules ? [" Enrolment rules also apply."] : []),
        ]
      : co
        ? ["None, but you must take ", ...co, " before or alongside it."]
        : [
            `${c} has no prerequisites`,
            f.hasEnrolmentRules ? ", but enrolment rules apply." : ".",
          ],
  })

  if (f.unlocks.length > 0) {
    const shown = f.unlocks.slice(0, 6)
    qs.push({
      id: "unlocks",
      question: `What can I take after ${c}?`,
      answer: [
        `${c} is a prerequisite or corequisite for ${plural(f.unlocks.length, "unit")}, including `,
        ...joinSegs(
          shown.map((u) => [unit(u)]),
          "and"
        ),
        f.leadsTo > f.unlocks.length
          ? `. Those lead on to ${plural(f.leadsTo, "unit")} in all.`
          : ".",
      ],
    })
  }

  qs.push({
    id: "offered",
    question: `When is ${c} offered?`,
    answer:
      f.periods.length > 0
        ? [
            `In ${f.year}, ${c} runs in ${joinWords(f.periods)}`,
            f.campuses.length > 0
              ? ` at ${joinWords(f.campuses.slice(0, 5))}${f.campuses.length > 5 ? ` and ${f.campuses.length - 5} more` : ""}`
              : "",
            f.online ? ", with an online option" : "",
            ".",
          ]
        : [`${c} has no offerings listed in the ${f.year} handbook.`],
  })

  const diff = scaleWord(f.rating, "difficulty")
  const load = scaleWord(f.rating, "workload")
  if (diff || load) {
    const n = Math.max(
      f.rating.axes.difficulty?.count ?? 0,
      f.rating.axes.workload?.count ?? 0
    )
    qs.push({
      id: "difficulty",
      question: `Is ${c} hard?`,
      answer: [
        `Students who took it rate it `,
        joinWords(
          [
            diff ? `${diff} to do well in` : null,
            load ? `${load} on workload` : null,
          ].filter((x): x is string => x != null)
        ),
        ` (${plural(n, "rating")}).`,
        workloadSentence(f) ? ` ${workloadSentence(f)}` : "",
      ],
    })
  } else if (workloadSentence(f)) {
    qs.push({
      id: "workload",
      question: `How much work is ${c}?`,
      answer: [
        `${workloadSentence(f)} No students have rated its difficulty yet.`,
      ],
    })
  }

  if (f.assessmentCount > 0) {
    qs.push({
      id: "exam",
      question: `Does ${c} have an exam?`,
      answer:
        f.examWeight == null
          ? [
              `No. ${c} has ${plural(f.assessmentCount, "assessment task")} and no exam.`,
            ]
          : [
              f.examWeight > 0
                ? `Yes. The exam is worth ${f.examWeight}% of the final mark`
                : "Yes, it has an exam",
              f.assessmentCount > 1
                ? `, alongside ${plural(f.assessmentCount - 1, "other task")}.`
                : ".",
            ],
    })
  }

  if (f.areasOfStudy.length > 0) {
    const shown = f.areasOfStudy.slice(0, 5)
    qs.push({
      id: "majors",
      question: `Which majors and minors include ${c}?`,
      answer: [
        `${c} is part of `,
        ...joinSegs(
          shown.map((a) => [{ kind: "aos", code: a.code, text: a.title }]),
          "and"
        ),
        f.areasOfStudy.length > shown.length
          ? `, and ${plural(f.areasOfStudy.length - shown.length, "other area")} of study.`
          : ".",
      ],
    })
  }

  if (f.rating.count > 0) qs.push(opinion(c, f.rating))
  return qs
}

function workloadSentence(f: UnitFacts): string | null {
  if (f.workloadHours)
    return `The handbook expects about ${f.workloadHours} hours of study across the semester.`
  return null
}

function opinion(name: string, r: RatingFacts): QA {
  const happy = (r.distribution[3] ?? 0) + (r.distribution[4] ?? 0)
  return {
    id: "reviews",
    question: `What do students think of ${name}?`,
    answer: [
      `It is rated ${ratingText(r)}`,
      r.count > 1
        ? `, and ${plural(happy, "student")} of ${r.count} gave it 4 or 5 stars.`
        : ".",
      " Read the reviews above or add your own.",
    ],
  }
}

/** Under 160 characters, for the meta description. */
export function unitDescription(f: UnitFacts): string {
  const pre = ruleSegs(f.prerequisites)
  const preText = pre ? plain(pre) : null
  return sentences([
    `${f.code} ${f.title} at Monash${ratedBy(f.rating)}.`,
    !preText
      ? "No prerequisites."
      : preText.length <= 50
        ? `Needs ${preText}.`
        : "Has prerequisites.",
    f.unlocks.length ? `Unlocks ${plural(f.unlocks.length, "unit")}.` : null,
    f.periods.length ? `Offered ${joinWords(f.periods)} ${f.year}.` : null,
    "Reviews and requisite map.",
  ])
}

/* ------------------------------------------------------------------ *
 * Courses
 * ------------------------------------------------------------------ */

export interface CourseFacts {
  code: string
  title: string
  year: string
  creditPoints: number
  /** "3 years". */
  duration: string | null
  qualification: string | null
  school: string | null
  campuses: string[]
  atar: string | null
  /** Areas of study by kind label, such as "major" -> 4. */
  aos: Array<{ code: string; title: string; kind: string }>
  rating: RatingFacts
}

const KIND_WORD: Record<string, [string, string]> = {
  major: ["major", "majors"],
  extended_major: ["extended major", "extended majors"],
  minor: ["minor", "minors"],
  specialisation: ["specialisation", "specialisations"],
  elective: ["elective stream", "elective streams"],
}

function aosCounts(aos: CourseFacts["aos"]): string[] {
  const n = new Map<string, number>()
  for (const a of aos) n.set(a.kind, (n.get(a.kind) ?? 0) + 1)
  return Object.keys(KIND_WORD)
    .filter((k) => n.get(k))
    .map((k) => {
      const c = n.get(k)!
      return `${c} ${KIND_WORD[k][c === 1 ? 0 : 1]}`
    })
}

export function courseLede(f: CourseFacts): Seg[] {
  const what = [
    f.duration ? `${f.duration.toLowerCase()} full-time` : null,
    `${f.creditPoints}-credit-point`,
    f.qualification?.toLowerCase(),
  ]
    .filter(Boolean)
    .join(", ")
  const out: Seg[] = [
    `${f.title} (${f.code}) is a ${what} course${f.school ? ` from the ${f.school}` : ""}${
      f.campuses.length
        ? `, taught at ${joinWords(f.campuses.slice(0, 3))}`
        : ""
    }.`,
  ]
  const counts = aosCounts(f.aos)
  if (counts.length)
    out.push(` In ${f.year} you can choose from ${joinWords(counts)}.`)
  if (f.rating.count > 0) out.push(` Students rate it ${ratingText(f.rating)}.`)
  out.push(" Map your units semester by semester with the MonMap planner.")
  return out
}

export function courseQuestions(f: CourseFacts): QA[] {
  const qs: QA[] = []
  if (f.duration) {
    qs.push({
      id: "duration",
      question: `How long is ${f.title}?`,
      answer: [
        `${f.duration} full time, ${f.creditPoints} credit points. At 24 credit points a semester, that is ${Math.round(f.creditPoints / 24)} semesters of full-time study.`,
      ],
    })
  }
  const majors = f.aos.filter(
    (a) => a.kind === "major" || a.kind === "extended_major"
  )
  const choice = majors.length
    ? majors
    : f.aos.filter((a) => a.kind === "specialisation")
  if (choice.length) {
    const word = majors.length ? "majors" : "specialisations"
    const shown = choice.slice(0, 8)
    qs.push({
      id: "majors",
      question: `What ${word} can I take in ${f.title}?`,
      answer: [
        `${plural(choice.length, word.slice(0, -1), word)} in ${f.year}, including `,
        ...joinSegs(
          shown.map((a) => [{ kind: "aos", code: a.code, text: a.title }]),
          "and"
        ),
        ".",
      ],
    })
  }
  if (f.atar && /\d/.test(f.atar)) {
    qs.push({
      id: "atar",
      question: `What ATAR do I need for ${f.title}?`,
      answer: [`The guaranteed ATAR listed for ${f.year} entry is ${f.atar}.`],
    })
  }
  if (f.campuses.length) {
    qs.push({
      id: "campus",
      question: `Where can I study ${f.title}?`,
      answer: [`At ${joinWords(f.campuses)}.`],
    })
  }
  qs.push({
    id: "plan",
    question: `How do I plan my ${f.title} units?`,
    answer: [
      "Open the course in the MonMap planner. It lays out your semesters, checks prerequisites as you drag units in, and tracks the credit points each requirement still needs.",
    ],
  })
  if (f.rating.count > 0) qs.push(opinion(f.title, f.rating))
  return qs
}

export function courseDescription(f: CourseFacts): string {
  return sentences([
    `${f.title} (${f.code}) at Monash${ratedBy(f.rating)}.`,
    f.duration
      ? `${capitalise(f.duration)} full time, ${f.creditPoints} credit points.`
      : null,
    aosCounts(f.aos).length
      ? `${capitalise(joinWords(aosCounts(f.aos)))}.`
      : null,
    "Reviews, structure and a course map planner.",
  ])
}

/* ------------------------------------------------------------------ *
 * Areas of study
 * ------------------------------------------------------------------ */

export interface AosFacts {
  code: string
  title: string
  year: string
  /** "major", "minor", ... */
  kind: string | null
  creditPoints: number | null
  unitCount: number
  /** Units the area of study lists, first ones first. */
  unitCodes: string[]
  campuses: string[]
  courses: Array<{ code: string; title: string }>
  rating: RatingFacts
}

export function aosLede(f: AosFacts): Seg[] {
  const kind = f.kind
    ? (KIND_WORD[f.kind]?.[0] ?? "area of study")
    : "area of study"
  const out: Seg[] = [
    `${f.title} (${f.code}) is a${/^[aeiou]/.test(kind) ? "n" : ""} ${kind}`,
    f.creditPoints ? ` worth ${f.creditPoints} credit points` : "",
    f.unitCount ? `, listing ${plural(f.unitCount, "unit")}` : "",
    f.campuses.length ? `, taught at ${joinWords(f.campuses.slice(0, 3))}` : "",
    ".",
  ]
  if (f.courses.length) {
    const shown = f.courses.slice(0, 2)
    out.push(
      ` It is offered in ${plural(f.courses.length, "course")}${
        f.courses.length > shown.length ? ", including " : ": "
      }`,
      ...joinSegs(
        shown.map((c) => [{ kind: "course", code: c.code, text: c.title }]),
        "and"
      ),
      "."
    )
  }
  if (f.rating.count > 0) out.push(` Students rate it ${ratingText(f.rating)}.`)
  return out
}

export function aosQuestions(f: AosFacts): QA[] {
  const qs: QA[] = []
  if (f.courses.length) {
    const shown = f.courses.slice(0, 8)
    qs.push({
      id: "courses",
      question: `Which courses offer ${f.title}?`,
      answer: [
        `${plural(f.courses.length, "course")} in ${f.year}: `,
        ...joinSegs(
          shown.map((c) => [{ kind: "course", code: c.code, text: c.title }]),
          "and"
        ),
        f.courses.length > shown.length
          ? `, and ${f.courses.length - shown.length} more.`
          : ".",
      ],
    })
  }
  if (f.unitCodes.length) {
    const shown = f.unitCodes.slice(0, 8)
    qs.push({
      id: "units",
      question: `What units are in ${f.title}?`,
      answer: [
        `It lists ${plural(f.unitCount, "unit")}, including `,
        ...joinSegs(
          shown.map((u) => [unit(u)]),
          "and"
        ),
        ". The structure above shows which are required and which you choose.",
      ],
    })
  }
  if (f.rating.count > 0) qs.push(opinion(f.title, f.rating))
  return qs
}

export function aosDescription(f: AosFacts): string {
  const kind = f.kind
    ? (KIND_WORD[f.kind]?.[0] ?? "area of study")
    : "area of study"
  return sentences([
    `${f.title} ${kind} (${f.code}) at Monash${ratedBy(f.rating)}.`,
    f.unitCount
      ? `${capitalise(plural(f.unitCount, "unit"))}${f.creditPoints ? `, ${f.creditPoints} credit points` : ""}.`
      : null,
    f.courses.length
      ? `Offered in ${plural(f.courses.length, "course")}.`
      : null,
    "Reviews, units and a requisite map.",
  ])
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const ratedBy = (r: RatingFacts) =>
  r.count > 0
    ? `, rated ${(r.average ?? 0).toFixed(1)}/5 by ${plural(r.count, "student")}`
    : ""

/**
 * Sentences joined up to 160 characters. When they don't fit, middle
 * ones go before the first and last, so no sentence is cut in half.
 */
function sentences(list: Array<string | null>): string {
  const parts = list.filter((p): p is string => !!p)
  let out = parts.join(" ")
  while (out.length > 160 && parts.length > 2) {
    parts.splice(parts.length - 2, 1)
    out = parts.join(" ")
  }
  return fit(out, 160)
}

/** Cut at a word boundary to `max` characters, with an ellipsis. */
function fit(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`
}

/**
 * How many units `code` leads to: everything that lists it, or lists
 * one of those, as a prerequisite or corequisite, as far as the graph
 * was expanded (four steps on unit pages).
 */
export function downstreamReach(
  code: string,
  edges: ReadonlyArray<{ from: string; to: string; type: string }>
): number {
  const next = new Map<string, string[]>()
  for (const e of edges) {
    if (e.type !== "prerequisite" && e.type !== "corequisite") continue
    if (e.from === e.to) continue
    next.set(e.to, [...(next.get(e.to) ?? []), e.from])
  }
  const seen = new Set<string>([code])
  const queue = [code]
  while (queue.length) {
    for (const n of next.get(queue.shift()!) ?? []) {
      if (!seen.has(n)) {
        seen.add(n)
        queue.push(n)
      }
    }
  }
  return seen.size - 1
}
