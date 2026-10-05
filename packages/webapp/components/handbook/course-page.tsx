import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { fetchCoursePage } from "@/lib/db/handbook"
import { isoDuration, MONASH_PROVIDER, ratingLd } from "@/lib/handbook/json-ld"
import { AOS_KINDS } from "@/lib/handbook/kinds"
import { monashHandbookUrl, planCourseHref } from "@/lib/handbook/links"
import { resolveEntity } from "@/lib/handbook/resolve"
import type { PlannerAreaOfStudy } from "@/lib/planner/types"
import { absoluteUrl } from "@/lib/seo"
import { prefetchTreeData } from "@/lib/tree/prefetch"

import {
  DoorOpenIcon,
  InfoIcon,
  ListTreeIcon,
  MapIcon,
  NetworkIcon,
} from "lucide-react"

import { EntityGraph } from "./entity-graph"
import {
  fetchEntityReviews,
  ReviewsSection,
} from "@/components/reviews/reviews-section"
import { JsonLd } from "./json-ld"
import { QuickAnswers, SegText } from "./quick-answers"
import {
  courseDescription,
  courseLede,
  courseQuestions,
  plain,
} from "@/lib/handbook/summary"
import { courseFacts, uniqueBy } from "@/lib/handbook/facts"
import { CurriculumTree, curriculumItems } from "./curriculum-tree"
import {
  entityCrumbs,
  entityMetadata,
  entityYearHref,
  YearNotice,
  yearNote,
} from "./entity-page"
import { EntityCards } from "./entity-lists"
import {
  DetailLayout,
  EntityHero,
  FactList,
  HandbookMain,
  Prose,
  Section,
  SubHeading,
  YearLinks,
} from "./frame"
import { loadRatings } from "./ratings"
import {
  ContactsSection,
  LearningOutcomesSection,
  OverviewSection,
  ProseBlocks,
} from "./sections"

export async function courseMetadata(
  rawCode: string,
  rawYear: string | null
): Promise<Metadata> {
  const r = await resolveEntity("course", rawCode, rawYear)
  const [c, reviews] = await Promise.all([
    fetchCoursePage(r.code, r.year),
    fetchEntityReviews("course", r.code),
  ])
  return entityMetadata(
    r,
    c && {
      title: `${c.title} (${c.code})${yearNote(r)}: Reviews & Course Map`,
      description: courseDescription(courseFacts(c, reviews.summary)),
    }
  )
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
  const yearHref = entityYearHref("course", c.code, r)
  const linkableUnits = new Set(c.linkableUnits)
  const facts = courseFacts(c, reviews.summary)

  const aos = uniqueBy(c.areasOfStudy, (a) => a.code)
  const aosByKind = new Map<string, PlannerAreaOfStudy[]>()
  for (const a of aos) {
    aosByKind.set(a.kind, [...(aosByKind.get(a.kind) ?? []), a])
  }
  const hasEntry = c.atar || c.entry || c.englishLanguage || c.nonYear12Entry
  const hasMore =
    c.progression || c.accreditation || c.specialNotes || c.otherInformation
  const campuses = facts.campuses.join(", ")
  const { crumbs, ld: crumbsLd } = entityCrumbs(
    [
      { label: "Search", href: "/search" },
      { label: "Courses", href: "/courses" },
    ],
    { code: c.code, name: `${c.code} ${c.title}`, canonical: r.canonical }
  )
  // Every list on the page shares one ratings load.
  const ratings = await loadRatings([
    ...c.components.map((x) => ({ kind: "course" as const, code: x.code })),
    ...curriculumItems(c.curriculum),
    ...aos.map((a) => ({ kind: "aos" as const, code: a.code })),
  ])

  return (
    <HandbookMain year={r.year}>
      <EntityHero
        kind="course"
        code={c.code}
        title={c.title}
        facts={[facts.qualification, c.abbreviatedName]}
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
          facts.atar && /\d/.test(facts.atar)
            ? { label: "Guaranteed ATAR", value: facts.atar }
            : null,
        ]}
        breadcrumbs={crumbs}
        year={r.year}
        years={r.years}
        yearHref={yearHref}
        handbookUrl={monashHandbookUrl("course", c.code, r.year)}
        rating={reviews.summary}
        actions={
          <Link
            href={planCourseHref(c.code, r.year)}
            // Every course would otherwise add a crawlable copy of "/".
            rel="nofollow"
            className="inline-flex h-8 items-center gap-1.5 rounded-control bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/80"
          >
            <MapIcon className="size-3.5" aria-hidden />
            Plan this course
          </Link>
        }
        lede={<SegText segs={courseLede(facts)} linkYear={linkYear} />}
        notice={<YearNotice kind="course" code={c.code} r={r} />}
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
          { id: "faq", label: "Common questions" },
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
              aosOptions: facts.aos,
            }}
          />
        </Section>

        <OverviewSection html={c.overview} linkYear={linkYear} />

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
                    ratings={ratings}
                  />
                </div>
              ) : null}
              {c.curriculum.length > 0 ? (
                <CurriculumTree
                  nodes={c.curriculum}
                  linkYear={linkYear}
                  linkableUnits={linkableUnits}
                  ratings={ratings}
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
              {AOS_KINDS.filter((k) => aosByKind.has(k.id)).map((k) => (
                <div key={k.id}>
                  <SubHeading>
                    {k.plural} ({aosByKind.get(k.id)!.length})
                  </SubHeading>
                  <EntityCards
                    rows={aosByKind.get(k.id)!.map((a) => ({
                      kind: "aos" as const,
                      code: a.code,
                      title: a.title,
                      note: a.scope ?? null,
                    }))}
                    linkYear={linkYear}
                    ratings={ratings}
                  />
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        <LearningOutcomesSection
          outcomes={c.learningOutcomes}
          intro={
            <Prose
              html={c.outcomesIntro}
              linkYear={linkYear}
              className="mb-4 text-muted-foreground"
            />
          }
          linkYear={linkYear}
        />

        {hasEntry ? (
          <Section
            clamp
            id="entry"
            title="Entry requirements"
            icon={DoorOpenIcon}
          >
            <div className="flex flex-col gap-6">
              {c.atar ? (
                <div>
                  <SubHeading>Guaranteed ATAR and selection rank</SubHeading>
                  <p className="max-w-[75ch] text-sm leading-relaxed">
                    {c.atar}
                  </p>
                </div>
              ) : null}
              <ProseBlocks
                blocks={[
                  ["Other applicants", c.nonYear12Entry],
                  ["English language", c.englishLanguage],
                  ["Pathways", c.entry],
                ]}
                linkYear={linkYear}
              />
            </div>
          </Section>
        ) : null}

        {hasMore ? (
          <Section clamp id="more" title="More information" icon={InfoIcon}>
            <div className="flex flex-col gap-6">
              <ProseBlocks
                blocks={[
                  ["Progression to further studies", c.progression],
                  ["Professional accreditation", c.accreditation],
                  ["Notes for students", c.specialNotes],
                  ["Other information", c.otherInformation],
                ]}
                linkYear={linkYear}
              />
            </div>
          </Section>
        ) : null}

        <ContactsSection contacts={c.contacts} />

        <QuickAnswers items={courseQuestions(facts)} linkYear={linkYear} />

        <Section id="details" title="Course details" icon={InfoIcon}>
          <div className="grid gap-x-10 md:grid-cols-2">
            <FactList
              rows={[
                facts.qualification
                  ? { label: "Qualification", value: facts.qualification }
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
            // Also a Course: Google shows review stars for Course, not
            // for EducationalOccupationalProgram.
            "@type": ["EducationalOccupationalProgram", "Course"],
            name: c.title,
            identifier: c.code,
            programType: facts.qualification ?? undefined,
            // MonMap's own summary: always present, never the handbook copy.
            description: plain(courseLede(facts)),
            url: absoluteUrl(r.canonical),
            timeToComplete: isoDuration(c.fullTime),
            numberOfCredits: c.creditPoints || undefined,
            educationalCredentialAwarded: c.awards[0] ?? c.title,
            provider: MONASH_PROVIDER,
            sameAs: monashHandbookUrl("course", c.code, r.year),
            ...ratingLd(reviews.summary, reviews.reviews),
          },
          crumbsLd,
        ]}
      />
    </HandbookMain>
  )
}
