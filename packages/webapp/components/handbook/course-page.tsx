import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { fetchCoursePage } from "@/lib/db/handbook"
import { entityHref, monashHandbookUrl } from "@/lib/handbook/links"
import { isoDuration, resolveEntity } from "@/lib/handbook/resolve"
import type { PlannerAreaOfStudy } from "@/lib/planner/types"
import { absoluteUrl, stripHtml, truncate } from "@/lib/seo"
import { prefetchTreeData } from "@/lib/tree/prefetch"

import { EntityGraph } from "./entity-graph"
import { JsonLd, breadcrumbLd } from "./json-ld"
import {
  CurriculumTree,
  DetailColumns,
  EntityHero,
  EntityRows,
  FactList,
  HandbookMain,
  Notice,
  Prose,
  Section,
  SectionNav,
  SubHeading,
  YearLinks,
} from "./parts"

const KIND_ORDER = [
  "major",
  "extended_major",
  "specialisation",
  "minor",
  "elective",
  "other",
] as const

const KIND_HEADING: Record<string, string> = {
  major: "Majors",
  extended_major: "Extended majors",
  specialisation: "Specialisations",
  minor: "Minors",
  elective: "Elective studies",
  other: "Other areas of study",
}

/** "Bachelor Degree" from "Level 7 - Bachelor Degree / Level 7 - ...". */
function qualification(aqf: string | null): string | null {
  return aqf?.split(" / ")[0]?.replace(/^Level \d+ - /, "") ?? null
}

export async function courseMetadata(
  rawCode: string,
  rawYear: string | null
): Promise<Metadata> {
  const r = await resolveEntity("course", rawCode, rawYear)
  const c = await fetchCoursePage(r.code, r.year)
  if (!c) return { title: r.code, robots: { index: false } }
  const yearNote = r.linkYear ? ` (${r.year})` : ""
  const facts = [
    `${c.creditPoints} credit points`,
    c.fullTime ? `${c.fullTime.toLowerCase()} full time` : null,
    c.locations,
  ]
    .filter(Boolean)
    .join(", ")
  const description = truncate(
    `${c.code} ${c.title} at Monash University${yearNote}: ${facts}. Course structure, majors and the units it requires. ${stripHtml(c.overview)}`,
    160
  )
  const title = `${c.code} ${c.title}${yearNote}`
  return {
    title,
    description,
    alternates: { canonical: r.canonical },
    openGraph: { title, description, type: "article", url: r.canonical },
    twitter: { card: "summary_large_image", title, description },
  }
}

export async function CoursePage({
  rawCode,
  rawYear,
}: {
  rawCode: string
  rawYear: string | null
}) {
  const r = await resolveEntity("course", rawCode, rawYear)
  const [c, graph] = await Promise.all([
    fetchCoursePage(r.code, r.year),
    prefetchTreeData({
      mode: "course",
      courseCode: r.code,
      aosCode: null,
      unitCode: null,
      direction: "upstream",
      year: r.year,
      useMyPlan: false,
    }),
  ])
  if (!c) notFound()

  const { linkYear } = r
  const yearHref = (y: string) =>
    entityHref("course", c.code, y === r.latest ? null : y)
  const linkableUnits = new Set(c.linkableUnits)

  const aosByKind = new Map<string, PlannerAreaOfStudy[]>()
  const seenAos = new Set<string>()
  for (const a of c.areasOfStudy) {
    if (seenAos.has(a.code)) continue
    seenAos.add(a.code)
    const list = aosByKind.get(a.kind) ?? []
    list.push(a)
    aosByKind.set(a.kind, list)
  }
  const hasEntry = c.atar || c.entry || c.englishLanguage || c.nonYear12Entry
  const hasMore =
    c.progression || c.accreditation || c.specialNotes || c.otherInformation

  const notice =
    r.year !== r.latest ? (
      <Notice>
        This is the {r.year} handbook entry.{" "}
        <a
          href={entityHref("course", c.code)}
          className="font-semibold underline"
        >
          See the {r.latest} entry
        </a>
        .
      </Notice>
    ) : r.year !== r.siteLatest ? (
      <Notice>
        The {r.siteLatest} handbook has no page for {c.code}. This is its{" "}
        {r.year} entry, the latest one.
      </Notice>
    ) : null

  return (
    <HandbookMain year={r.year}>
      <EntityHero
        kind="course"
        code={c.code}
        title={c.title}
        facts={[
          qualification(c.aqfLevel),
          `${c.creditPoints} credit points`,
          c.fullTime ? `${c.fullTime} full time` : null,
          c.locations,
        ]}
        subtitle={
          [c.abbreviatedName, c.school].filter(Boolean).join(" | ") || null
        }
        breadcrumbs={[
          { label: "Search", href: "/search" },
          { label: "Courses", href: "/search?type=courses" },
          { label: c.code },
        ]}
        year={r.year}
        years={r.years}
        yearHref={yearHref}
        handbookUrl={monashHandbookUrl("course", c.code, r.year)}
        notice={notice}
      />

      <SectionNav
        items={[
          c.overview ? { id: "overview", label: "Overview" } : null,
          c.curriculum.length > 0
            ? { id: "structure", label: "Structure" }
            : null,
          aosByKind.size > 0
            ? { id: "areas-of-study", label: "Areas of study" }
            : null,
          c.learningOutcomes.length > 0
            ? { id: "outcomes", label: "Learning outcomes" }
            : null,
          hasEntry ? { id: "entry", label: "Entry requirements" } : null,
          hasMore ? { id: "more", label: "More information" } : null,
        ]}
      />

      <EntityGraph
        initial={graph}
        year={r.year}
        linkYear={linkYear}
        title="Requisite map"
        subtitle="The course's foundation units and the prerequisites behind them. Pick an area of study to add its units."
        emptyText={`The ${r.year} handbook lists no units for ${c.code} itself. Pick an area of study to see its units.`}
        course={{
          code: c.code,
          aosOptions: c.areasOfStudy
            .filter(
              (a, i, all) => all.findIndex((b) => b.code === a.code) === i
            )
            .map((a) => ({ code: a.code, title: a.title, kind: a.kind })),
        }}
      />

      <DetailColumns
        main={
          <>
            {c.overview ? (
              <Section id="overview" title="Overview">
                <Prose html={c.overview} linkYear={linkYear} />
              </Section>
            ) : null}

            {c.curriculum.length > 0 || c.requirements ? (
              <Section id="structure" title="Course structure">
                {c.curriculum.length > 0 ? (
                  <CurriculumTree
                    nodes={c.curriculum}
                    linkYear={linkYear}
                    linkableUnits={linkableUnits}
                  />
                ) : (
                  <Prose html={c.requirements} linkYear={linkYear} />
                )}
                {/* The handbook's prose repeats the structure above in
                    words, with the rules the tree can't express. */}
                {c.curriculum.length > 0 && (c.requirements || c.structure) ? (
                  <details className="mt-4 rounded-control bg-muted/40 px-4 py-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      The handbook&apos;s description of this structure
                    </summary>
                    <Prose
                      html={c.structure}
                      linkYear={linkYear}
                      className="mt-3"
                    />
                    <Prose
                      html={c.requirements}
                      linkYear={linkYear}
                      className="mt-3"
                    />
                  </details>
                ) : null}
              </Section>
            ) : null}

            {c.learningOutcomes.length > 0 ? (
              <Section id="outcomes" title="Learning outcomes">
                {c.outcomesIntro ? (
                  <Prose
                    html={c.outcomesIntro}
                    linkYear={linkYear}
                    className="mb-3 text-muted-foreground"
                  />
                ) : null}
                <ol className="flex flex-col gap-2">
                  {c.learningOutcomes.map((o, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-6 shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
                        {i + 1}
                      </span>
                      <Prose html={o.html} linkYear={linkYear} />
                    </li>
                  ))}
                </ol>
              </Section>
            ) : null}

            {hasEntry ? (
              <Section id="entry" title="Entry requirements">
                {c.atar ? (
                  <>
                    <SubHeading>Guaranteed ATAR and selection rank</SubHeading>
                    <p className="text-sm">{c.atar}</p>
                  </>
                ) : null}
                {c.nonYear12Entry ? (
                  <>
                    <SubHeading>Other applicants</SubHeading>
                    <Prose html={c.nonYear12Entry} linkYear={linkYear} />
                  </>
                ) : null}
                {c.englishLanguage ? (
                  <>
                    <SubHeading>English language</SubHeading>
                    <Prose html={c.englishLanguage} linkYear={linkYear} />
                  </>
                ) : null}
                {c.entry ? (
                  <>
                    <SubHeading>Pathways</SubHeading>
                    <Prose html={c.entry} linkYear={linkYear} />
                  </>
                ) : null}
              </Section>
            ) : null}

            {hasMore ? (
              <Section id="more" title="More information">
                {c.progression ? (
                  <>
                    <SubHeading>Progression to further studies</SubHeading>
                    <Prose html={c.progression} linkYear={linkYear} />
                  </>
                ) : null}
                {c.accreditation ? (
                  <>
                    <SubHeading>Professional accreditation</SubHeading>
                    <Prose html={c.accreditation} linkYear={linkYear} />
                  </>
                ) : null}
                {c.specialNotes ? (
                  <>
                    <SubHeading>Notes for students</SubHeading>
                    <Prose html={c.specialNotes} linkYear={linkYear} />
                  </>
                ) : null}
                {c.otherInformation ? (
                  <>
                    <SubHeading>Other information</SubHeading>
                    <Prose html={c.otherInformation} linkYear={linkYear} />
                  </>
                ) : null}
              </Section>
            ) : null}
          </>
        }
        aside={
          <>
            <Section title="Course details">
              <FactList
                rows={[
                  qualification(c.aqfLevel)
                    ? {
                        label: "Qualification",
                        value: qualification(c.aqfLevel),
                      }
                    : null,
                  c.aqfLevel
                    ? {
                        label: "AQF level",
                        value: c.aqfLevel.match(/Level \d+/)?.[0] ?? null,
                      }
                    : null,
                  { label: "Credit points", value: c.creditPoints },
                  c.fullTime ? { label: "Full time", value: c.fullTime } : null,
                  c.partTime ? { label: "Part time", value: c.partTime } : null,
                  c.maximumYears
                    ? {
                        label: "Maximum time",
                        value: `${c.maximumYears} years`,
                      }
                    : null,
                  c.modes.length > 0
                    ? {
                        label: "Delivery",
                        value: (
                          <span className="flex flex-col">
                            {c.modes.map((m) => (
                              <span key={m.mode}>
                                {m.mode}
                                {m.locations.length
                                  ? `: ${m.locations.join(", ")}`
                                  : ""}
                              </span>
                            ))}
                          </span>
                        ),
                      }
                    : c.locations
                      ? { label: "Locations", value: c.locations }
                      : null,
                  c.school ? { label: "Faculty", value: c.school } : null,
                  c.cricosCode
                    ? { label: "CRICOS code", value: c.cricosCode }
                    : null,
                  c.abbreviatedName
                    ? { label: "Abbreviation", value: c.abbreviatedName }
                    : null,
                  {
                    label: "Handbook years",
                    value: (
                      <YearLinks
                        years={r.years}
                        current={r.year}
                        href={yearHref}
                      />
                    ),
                  },
                ]}
              />
            </Section>

            {c.components.length > 0 ? (
              <Section title="Component degrees">
                <EntityRows
                  rows={c.components.map((x) => ({
                    kind: "course" as const,
                    code: x.code,
                    title: x.title,
                  }))}
                  linkYear={linkYear}
                />
              </Section>
            ) : null}

            {aosByKind.size > 0 ? (
              <Section id="areas-of-study" title="Areas of study">
                {KIND_ORDER.filter((k) => aosByKind.has(k)).map((k) => (
                  <div key={k}>
                    <SubHeading>{KIND_HEADING[k]}</SubHeading>
                    <EntityRows
                      rows={aosByKind.get(k)!.map((a) => ({
                        kind: "aos" as const,
                        code: a.code,
                        title: a.title,
                        note: a.scope ?? null,
                      }))}
                      linkYear={linkYear}
                    />
                  </div>
                ))}
              </Section>
            ) : null}

            {c.awards.length > 0 ? (
              <Section title="Award titles">
                <ul className="flex flex-col gap-1 text-sm">
                  {c.awards.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {c.contacts.length > 0 ? (
              <Section title="Contacts">
                <FactList
                  rows={c.contacts.map((x) => ({
                    label: x.role.replace(/\(s\)$/, "s"),
                    value: (
                      <span className="flex flex-col">
                        {x.names.map((n) => (
                          <span key={n}>{n}</span>
                        ))}
                      </span>
                    ),
                  }))}
                />
              </Section>
            ) : null}
          </>
        }
      />

      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "EducationalOccupationalProgram",
            name: c.title,
            identifier: c.code,
            programType: qualification(c.aqfLevel) ?? undefined,
            description: truncate(stripHtml(c.overview), 500) || undefined,
            url: absoluteUrl(r.canonical),
            timeToComplete: isoDuration(c.fullTime),
            numberOfCredits: c.creditPoints || undefined,
            educationalCredentialAwarded: c.awards[0] ?? c.title,
            provider: {
              "@type": "CollegeOrUniversity",
              name: "Monash University",
              sameAs: "https://www.monash.edu/",
            },
            sameAs: monashHandbookUrl("course", c.code, r.year),
          },
          breadcrumbLd([
            { name: "Search", path: "/search" },
            { name: "Courses", path: "/search?type=courses" },
            { name: `${c.code} ${c.title}`, path: r.canonical },
          ]),
        ]}
      />
    </HandbookMain>
  )
}
