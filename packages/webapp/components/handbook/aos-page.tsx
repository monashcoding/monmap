import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { AOS_KIND_LABEL, fetchAosPage } from "@/lib/db/handbook"
import { entityHref, monashHandbookUrl } from "@/lib/handbook/links"
import { resolveEntity } from "@/lib/handbook/resolve"
import { absoluteUrl } from "@/lib/seo"
import { prefetchGraphForSeeds } from "@/lib/tree/prefetch"

import {
  BookOpenIcon,
  GraduationCapIcon,
  InfoIcon,
  ListTreeIcon,
  NetworkIcon,
  NotebookPenIcon,
  TargetIcon,
  UsersIcon,
} from "lucide-react"

import { EntityGraph } from "./entity-graph"
import {
  fetchEntityReviews,
  ReviewsSection,
} from "@/components/reviews/reviews-section"
import { JsonLd, breadcrumbLd, ratingLd } from "./json-ld"
import { QuickAnswers, SegText } from "./quick-answers"
import {
  aosDescription,
  aosLede,
  aosQuestions,
  plain,
} from "@/lib/handbook/summary"
import { aosFacts } from "@/lib/handbook/facts"
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
  YearLinks,
} from "./parts"

export async function aosMetadata(
  rawCode: string,
  rawYear: string | null
): Promise<Metadata> {
  const r = await resolveEntity("aos", rawCode, rawYear)
  const [a, reviews] = await Promise.all([
    fetchAosPage(r.code, r.year),
    fetchEntityReviews("aos", r.code),
  ])
  if (!a) return { title: r.code, robots: { index: false } }
  const kind = a.kind ? AOS_KIND_LABEL[a.kind] : "Area of study"
  const yearNote = r.linkYear ? ` (${r.year} handbook)` : ""
  const title = `${a.title} ${kind} (${a.code})${yearNote}: Reviews & Units`
  const description = aosDescription(aosFacts(a, reviews.summary))
  return {
    title,
    description,
    alternates: { canonical: r.canonical },
    robots: r.indexable ? undefined : { index: false, follow: true },
    openGraph: { title, description, type: "article", url: r.canonical },
    twitter: { card: "summary_large_image", title, description },
  }
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
  const graph = await prefetchGraphForSeeds(a.unitCodes, r.year, "upstream")

  const { linkYear } = r
  const yearHref = (y: string) =>
    entityHref("aos", a.code, y === r.latest ? null : y)
  const kindLabel = a.kind ? AOS_KIND_LABEL[a.kind] : "Area of study"
  const facts = aosFacts(a, reviews.summary)

  const notice =
    r.year !== r.latest ? (
      <Notice>
        This is the {r.year} handbook entry.{" "}
        <a href={entityHref("aos", a.code)} className="font-semibold underline">
          See the {r.latest} entry
        </a>
        .
      </Notice>
    ) : r.year !== r.siteLatest ? (
      <Notice>
        The {r.siteLatest} handbook has no page for {a.code}. This is its{" "}
        {r.year} entry, the latest one.
      </Notice>
    ) : null

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
        breadcrumbs={[
          { label: "Search", href: "/search" },
          { label: "Areas of study", href: "/aos" },
          { label: a.code },
        ]}
        year={r.year}
        years={r.years}
        yearHref={yearHref}
        handbookUrl={monashHandbookUrl("aos", a.code, r.year)}
        rating={reviews.summary}
        lede={
          <SegText
            segs={aosLede(facts)}
            linkYear={linkYear}
            linkableUnits={new Set(a.linkableUnits)}
          />
        }
        notice={notice}
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

        {a.description ? (
          <Section clamp id="overview" title="Overview" icon={BookOpenIcon}>
            <Prose
              html={a.description}
              linkYear={linkYear}
              className="text-[15px]"
            />
          </Section>
        ) : null}

        {a.curriculum.length > 0 ? (
          <Section id="structure" title="Structure" icon={ListTreeIcon}>
            <CurriculumTree
              nodes={a.curriculum}
              linkYear={linkYear}
              linkableUnits={new Set(a.linkableUnits)}
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
                note: AOS_KIND_LABEL[c.kind] ?? null,
              }))}
              linkYear={linkYear}
            />
          </Section>
        ) : null}

        {a.specialStatements ? (
          <Section id="notes" title="Notes" icon={NotebookPenIcon}>
            <Prose html={a.specialStatements} linkYear={linkYear} />
          </Section>
        ) : null}

        {a.learningOutcomes.length > 0 ? (
          <Section
            clamp
            id="outcomes"
            title="Learning outcomes"
            icon={TargetIcon}
          >
            {a.outcomesIntro ? (
              <Prose
                html={a.outcomesIntro}
                linkYear={linkYear}
                className="mb-4 text-muted-foreground"
              />
            ) : null}
            <ol className="flex flex-col gap-3">
              {a.learningOutcomes.map((o, i) => (
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

        {a.contacts.length > 0 ? (
          <Section id="contacts" title="Contacts" icon={UsersIcon}>
            <dl className="grid gap-4 sm:grid-cols-2">
              {a.contacts.map((x) => (
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

        <QuickAnswers
          items={aosQuestions(facts)}
          linkYear={linkYear}
          linkableUnits={new Set(a.linkableUnits)}
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
            provider: {
              "@type": "CollegeOrUniversity",
              name: "Monash University",
              sameAs: "https://www.monash.edu/",
            },
            sameAs: monashHandbookUrl("aos", a.code, r.year),
            ...ratingLd(reviews.summary, reviews.reviews),
          },
          breadcrumbLd([
            { name: "Search", path: "/search" },
            { name: "Areas of study", path: "/aos" },
            { name: `${a.title} (${a.code})`, path: r.canonical },
          ]),
        ]}
      />
    </HandbookMain>
  )
}
