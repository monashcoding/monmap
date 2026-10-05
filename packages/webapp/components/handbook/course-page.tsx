import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { fetchCoursePage } from "@/lib/db/handbook"
import { entityHref, monashHandbookUrl } from "@/lib/handbook/links"
import { isoDuration, resolveEntity } from "@/lib/handbook/resolve"
import type { PlannerAreaOfStudy } from "@/lib/planner/types"
import { absoluteUrl, stripHtml, truncate } from "@/lib/seo"
import { prefetchTreeData } from "@/lib/tree/prefetch"

import {
  BookOpenIcon,
  DoorOpenIcon,
  InfoIcon,
  ListTreeIcon,
  MapIcon,
  NetworkIcon,
  TargetIcon,
  UsersIcon,
} from "lucide-react"

import { EntityGraph } from "./entity-graph"
import {
  fetchEntityReviews,
  ReviewsSection,
} from "@/components/reviews/reviews-section"
import { JsonLd, breadcrumbLd } from "./json-ld"
import {
  CurriculumTree,
  DetailLayout,
  EntityCards,
  EntityHero,
  FactList,
  HandbookMain,
  Notice,
  Prose,
  Section,
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
  const [c, graph, reviews] = await Promise.all([
    fetchCoursePage(r.code, r.year),
    prefetchTreeData({
      mode: "course",
      courseCode: r.code,
      aosCode: null,
      unitCode: null,
      direction: "upstream",
      year: r.year,
    }),
    fetchEntityReviews("course", r.code),
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

  // "70; International: ..." leads with the domestic guaranteed ATAR.
  const atar = c.atar?.split(";")[0]?.trim() || null
  const campuses = c.modes.length
    ? [...new Set(c.modes.flatMap((m) => m.locations))].join(", ")
    : c.locations

  return (
    <HandbookMain year={r.year}>
      <EntityHero
        kind="course"
        code={c.code}
        title={c.title}
        facts={[qualification(c.aqfLevel), c.abbreviatedName]}
        subtitle={c.school}
        stats={[
          { label: "Credit points", value: String(c.creditPoints) },
          c.fullTime
            ? {
                label: "Duration",
                value: `${c.fullTime.toLowerCase()} full time`,
                hint: c.partTime
                  ? `${c.partTime.toLowerCase()} part time`
                  : null,
              }
            : null,
          campuses
            ? {
                label: "Campus",
                value: campuses,
                hint: c.modes.map((m) => m.mode).join(", ") || null,
              }
            : null,
          atar && /\d/.test(atar)
            ? { label: "Guaranteed ATAR", value: atar }
            : null,
        ]}
        breadcrumbs={[
          { label: "Search", href: "/search" },
          { label: "Courses", href: "/search?type=courses" },
          { label: c.code },
        ]}
        year={r.year}
        years={r.years}
        yearHref={yearHref}
        handbookUrl={monashHandbookUrl("course", c.code, r.year)}
        rating={reviews.summary}
        notice={notice}
      />

      <DetailLayout
        toc={[
          { id: "reviews", label: "Reviews" },
          { id: "map", label: "Requisite map" },
          c.overview ? { id: "overview", label: "Overview" } : null,
          c.curriculum.length > 0 || c.requirements
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
          c.contacts.length > 0 ? { id: "contacts", label: "Contacts" } : null,
          { id: "details", label: "Course details" },
        ]}
      >
        <ReviewsSection
          kind="course"
          code={c.code}
          title={c.title}
          data={reviews}
        />

        <Section id="map" title="Requisite map" icon={NetworkIcon}>
          <EntityGraph
            initial={graph}
            year={r.year}
            linkYear={linkYear}
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
        </Section>

        {c.overview ? (
          <Section id="overview" title="Overview" icon={BookOpenIcon}>
            <Prose
              html={c.overview}
              linkYear={linkYear}
              className="text-[15px]"
            />
          </Section>
        ) : null}

        {c.curriculum.length > 0 || c.requirements ? (
          <Section id="structure" title="Course structure" icon={ListTreeIcon}>
            <div className="flex flex-col gap-4">
              {c.components.length > 0 ? (
                <div>
                  <SubHeading>Made up of</SubHeading>
                  <EntityCards
                    rows={c.components.map((x) => ({
                      kind: "course" as const,
                      code: x.code,
                      title: x.title,
                      note: x.componentTitle,
                    }))}
                    linkYear={linkYear}
                  />
                </div>
              ) : null}
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
                <details className="rounded-control bg-muted/40 px-4 py-3">
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
            </div>
          </Section>
        ) : null}

        {aosByKind.size > 0 ? (
          <Section id="areas-of-study" title="Areas of study" icon={MapIcon}>
            <div className="flex flex-col gap-6">
              {KIND_ORDER.filter((k) => aosByKind.has(k)).map((k) => (
                <div key={k}>
                  <SubHeading>
                    {KIND_HEADING[k]} ({aosByKind.get(k)!.length})
                  </SubHeading>
                  <EntityCards
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
            </div>
          </Section>
        ) : null}

        {c.learningOutcomes.length > 0 ? (
          <Section id="outcomes" title="Learning outcomes" icon={TargetIcon}>
            {c.outcomesIntro ? (
              <Prose
                html={c.outcomesIntro}
                linkYear={linkYear}
                className="mb-4 text-muted-foreground"
              />
            ) : null}
            <ol className="flex flex-col gap-3">
              {c.learningOutcomes.map((o, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <Prose html={o.html} linkYear={linkYear} className="pt-0.5" />
                </li>
              ))}
            </ol>
          </Section>
        ) : null}

        {hasEntry ? (
          <Section id="entry" title="Entry requirements" icon={DoorOpenIcon}>
            <div className="flex flex-col gap-6">
              {c.atar ? (
                <div>
                  <SubHeading>Guaranteed ATAR and selection rank</SubHeading>
                  <p className="max-w-[75ch] text-sm leading-relaxed">
                    {c.atar}
                  </p>
                </div>
              ) : null}
              {c.nonYear12Entry ? (
                <div>
                  <SubHeading>Other applicants</SubHeading>
                  <Prose html={c.nonYear12Entry} linkYear={linkYear} />
                </div>
              ) : null}
              {c.englishLanguage ? (
                <div>
                  <SubHeading>English language</SubHeading>
                  <Prose html={c.englishLanguage} linkYear={linkYear} />
                </div>
              ) : null}
              {c.entry ? (
                <div>
                  <SubHeading>Pathways</SubHeading>
                  <Prose html={c.entry} linkYear={linkYear} />
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}

        {hasMore ? (
          <Section id="more" title="More information" icon={InfoIcon}>
            <div className="flex flex-col gap-6">
              {c.progression ? (
                <div>
                  <SubHeading>Progression to further studies</SubHeading>
                  <Prose html={c.progression} linkYear={linkYear} />
                </div>
              ) : null}
              {c.accreditation ? (
                <div>
                  <SubHeading>Professional accreditation</SubHeading>
                  <Prose html={c.accreditation} linkYear={linkYear} />
                </div>
              ) : null}
              {c.specialNotes ? (
                <div>
                  <SubHeading>Notes for students</SubHeading>
                  <Prose html={c.specialNotes} linkYear={linkYear} />
                </div>
              ) : null}
              {c.otherInformation ? (
                <div>
                  <SubHeading>Other information</SubHeading>
                  <Prose html={c.otherInformation} linkYear={linkYear} />
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}

        {c.contacts.length > 0 ? (
          <Section id="contacts" title="Contacts" icon={UsersIcon}>
            <dl className="grid gap-4 sm:grid-cols-2">
              {c.contacts.map((x) => (
                <div key={x.role}>
                  <dt className="mb-1 text-xs text-muted-foreground">
                    {x.role.replace(/\(s\)$/, "s")}
                  </dt>
                  {x.names.map((n) => (
                    <dd key={n} className="text-sm font-medium">
                      {n}
                    </dd>
                  ))}
                </div>
              ))}
            </dl>
          </Section>
        ) : null}

        <Section id="details" title="Course details" icon={InfoIcon}>
          <div className="grid gap-x-10 md:grid-cols-2">
            <FactList
              rows={[
                qualification(c.aqfLevel)
                  ? { label: "Qualification", value: qualification(c.aqfLevel) }
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
                  ? { label: "Maximum time", value: `${c.maximumYears} years` }
                  : null,
              ]}
            />
            <FactList
              rows={[
                c.school ? { label: "Faculty", value: c.school } : null,
                c.cricosCode
                  ? { label: "CRICOS code", value: c.cricosCode }
                  : null,
                c.abbreviatedName
                  ? { label: "Abbreviation", value: c.abbreviatedName }
                  : null,
                c.awards.length > 0
                  ? {
                      label:
                        c.awards.length === 1 ? "Award title" : "Award titles",
                      value: (
                        <span className="flex flex-col">
                          {c.awards.map((a) => (
                            <span key={a}>{a}</span>
                          ))}
                        </span>
                      ),
                    }
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
          </div>
        </Section>
      </DetailLayout>

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
