import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { fetchAosPage } from "@/lib/db/handbook"
import { MONASH_PROVIDER, ratingLd } from "@/lib/handbook/json-ld"
import { aosKind, aosKindLabel } from "@/lib/handbook/kinds"
import { monashHandbookUrl } from "@/lib/handbook/links"
import { resolveEntity } from "@/lib/handbook/resolve"
import { absoluteUrl } from "@/lib/seo"
import { prefetchGraphForSeeds } from "@/lib/tree/prefetch"

import {
  GraduationCapIcon,
  InfoIcon,
  ListTreeIcon,
  NetworkIcon,
  NotebookPenIcon,
} from "lucide-react"

import { EntityGraph } from "./entity-graph"
import {
  fetchEntityReviews,
  ReviewsSection,
} from "@/components/reviews/reviews-section"
import { JsonLd } from "./json-ld"
import { QuickAnswers, SegText } from "./quick-answers"
import {
  aosDescription,
  aosLede,
  aosQuestions,
  plain,
} from "@/lib/handbook/summary"
import { aosFacts } from "@/lib/handbook/facts"
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
  YearLinks,
} from "./frame"
import { loadRatings } from "./ratings"
import {
  ContactsSection,
  LearningOutcomesSection,
  OverviewSection,
} from "./sections"

export async function aosMetadata(
  rawCode: string,
  rawYear: string | null
): Promise<Metadata> {
  const r = await resolveEntity("aos", rawCode, rawYear)
  const [a, reviews] = await Promise.all([
    fetchAosPage(r.code, r.year),
    fetchEntityReviews("aos", r.code),
  ])
  return entityMetadata(
    r,
    a && {
      title: `${a.title} ${aosKindLabel(a.kind)} (${a.code})${yearNote(r)}: Reviews & Units`,
      description: aosDescription(aosFacts(a, reviews.summary)),
    }
  )
}

export async function AosPage({
  rawCode,
  rawYear,
}: {
  rawCode: string
  rawYear: string | null
}) {
  const r = await resolveEntity("aos", rawCode, rawYear)
  const [a, reviews] = await Promise.all([
    fetchAosPage(r.code, r.year),
    fetchEntityReviews("aos", r.code),
  ])
  if (!a) notFound()
  const [graph, ratings] = await Promise.all([
    prefetchGraphForSeeds(a.unitCodes, r.year, "upstream"),
    // Every list on the page shares one ratings load.
    loadRatings([
      ...curriculumItems(a.curriculum),
      ...a.courses.map((c) => ({ kind: "course" as const, code: c.code })),
    ]),
  ])

  const { linkYear } = r
  const yearHref = entityYearHref("aos", a.code, r)
  const kindLabel = aosKindLabel(a.kind)
  const facts = aosFacts(a, reviews.summary)
  const linkableUnits = new Set(a.linkableUnits)
  const { crumbs, ld: crumbsLd } = entityCrumbs(
    [
      { label: "Search", href: "/search" },
      { label: "Areas of study", href: "/aos" },
    ],
    { code: a.code, name: `${a.title} (${a.code})`, canonical: r.canonical }
  )

  return (
    <HandbookMain year={r.year}>
      <EntityHero
        kind="aos"
        kindLabel={kindLabel}
        code={a.code}
        title={a.title}
        facts={[a.studyLevel]}
        subtitle={a.school}
        stats={[
          a.creditPoints
            ? { label: "Credit points", value: String(a.creditPoints) }
            : null,
          { label: "Units", value: String(a.unitCodes.length) },
          a.locations ? { label: "Campus", value: a.locations } : null,
          a.courses.length > 0
            ? {
                label: "Offered in",
                value: `${a.courses.length} course${a.courses.length === 1 ? "" : "s"}`,
              }
            : null,
        ]}
        breadcrumbs={crumbs}
        year={r.year}
        years={r.years}
        yearHref={yearHref}
        handbookUrl={monashHandbookUrl("aos", a.code, r.year)}
        rating={reviews.summary}
        lede={
          <SegText
            segs={aosLede(facts)}
            linkYear={linkYear}
            linkableUnits={linkableUnits}
          />
        }
        notice={<YearNotice kind="aos" code={a.code} r={r} />}
      />

      <DetailLayout
        toc={[
          { id: "reviews", label: "Reviews" },
          { id: "map", label: "Requisite map" },
          a.description ? { id: "overview", label: "Overview" } : null,
          a.curriculum.length > 0
            ? { id: "structure", label: "Structure" }
            : null,
          a.courses.length > 0 ? { id: "courses", label: "Courses" } : null,
          a.specialStatements ? { id: "notes", label: "Notes" } : null,
          a.learningOutcomes.length > 0
            ? { id: "outcomes", label: "Learning outcomes" }
            : null,
          a.contacts.length > 0 ? { id: "contacts", label: "Contacts" } : null,
          { id: "faq", label: "Common questions" },
          { id: "details", label: "Details" },
        ]}
      >
        <ReviewsSection
          kind="aos"
          code={a.code}
          title={a.title}
          data={reviews}
        />

        <Section id="map" title="Requisite map" icon={NetworkIcon}>
          <EntityGraph
            initial={graph}
            year={r.year}
            linkYear={linkYear}
            emptyText={`None of the units in ${a.title} have prerequisites in the ${r.year} handbook.`}
          />
        </Section>

        <OverviewSection html={a.description} linkYear={linkYear} />

        {a.curriculum.length > 0 ? (
          <Section id="structure" title="Structure" icon={ListTreeIcon}>
            <CurriculumTree
              nodes={a.curriculum}
              linkYear={linkYear}
              linkableUnits={linkableUnits}
              ratings={ratings}
            />
          </Section>
        ) : null}

        {a.courses.length > 0 ? (
          <Section
            id="courses"
            title="Courses that offer it"
            icon={GraduationCapIcon}
          >
            <EntityCards
              rows={a.courses.map((c) => ({
                kind: "course" as const,
                code: c.code,
                title: c.title,
                note: aosKind(c.kind)?.label ?? null,
              }))}
              linkYear={linkYear}
              ratings={ratings}
            />
          </Section>
        ) : null}

        {a.specialStatements ? (
          <Section id="notes" title="Notes" icon={NotebookPenIcon}>
            <Prose html={a.specialStatements} linkYear={linkYear} />
          </Section>
        ) : null}

        <LearningOutcomesSection
          outcomes={a.learningOutcomes}
          intro={
            <Prose
              html={a.outcomesIntro}
              linkYear={linkYear}
              className="mb-4 text-muted-foreground"
            />
          }
          linkYear={linkYear}
        />

        <ContactsSection contacts={a.contacts} />

        <QuickAnswers
          items={aosQuestions(facts)}
          linkYear={linkYear}
          linkableUnits={linkableUnits}
        />

        <Section id="details" title={`${kindLabel} details`} icon={InfoIcon}>
          <div className="grid gap-x-10 md:grid-cols-2">
            <FactList
              rows={[
                { label: "Type", value: kindLabel },
                a.studyLevel
                  ? { label: "Study level", value: a.studyLevel }
                  : null,
                a.creditPoints
                  ? { label: "Credit points", value: a.creditPoints }
                  : null,
              ]}
            />
            <FactList
              rows={[
                a.school ? { label: "Faculty", value: a.school } : null,
                a.academicOrg && a.academicOrg !== a.school
                  ? { label: "Organisational unit", value: a.academicOrg }
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
            // A course of study within a degree; typed as Course so its
            // reviews can show as stars in search results.
            "@type": "Course",
            name: `${a.title} (${a.code})`,
            courseCode: a.code,
            // MonMap's own summary: always present, never the handbook copy.
            description: plain(aosLede(facts)),
            url: absoluteUrl(r.canonical),
            provider: MONASH_PROVIDER,
            sameAs: monashHandbookUrl("aos", a.code, r.year),
            ...ratingLd(reviews.summary, reviews.reviews),
          },
          crumbsLd,
        ]}
      />
    </HandbookMain>
  )
}
