import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { AOS_KIND_LABEL, fetchAosPage } from "@/lib/db/handbook"
import { entityHref, monashHandbookUrl } from "@/lib/handbook/links"
import { resolveEntity } from "@/lib/handbook/resolve"
import { absoluteUrl, stripHtml, truncate } from "@/lib/seo"
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
  YearLinks,
} from "./parts"

export async function aosMetadata(
  rawCode: string,
  rawYear: string | null
): Promise<Metadata> {
  const r = await resolveEntity("aos", rawCode, rawYear)
  const a = await fetchAosPage(r.code, r.year)
  if (!a) return { title: r.code, robots: { index: false } }
  const kind = a.kind ? AOS_KIND_LABEL[a.kind] : "Area of study"
  const yearNote = r.linkYear ? ` (${r.year})` : ""
  const title = `${a.title} ${kind.toLowerCase()} (${a.code})${yearNote}`
  const description = truncate(
    `${a.title}, a ${a.studyLevel ? `${a.studyLevel.toLowerCase()} ` : ""}${kind.toLowerCase()} at Monash University${yearNote}: ${a.creditPoints ? `${a.creditPoints} credit points, ` : ""}its units, structure and the courses that offer it. ${stripHtml(a.description)}`,
    160
  )
  return {
    title,
    description,
    alternates: { canonical: r.canonical },
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
          { label: "Areas of study", href: "/search?type=aos" },
          { label: a.code },
        ]}
        year={r.year}
        years={r.years}
        yearHref={yearHref}
        handbookUrl={monashHandbookUrl("aos", a.code, r.year)}
        rating={reviews.summary}
        notice={notice}
      />

      <DetailLayout
        toc={[
          a.description ? { id: "overview", label: "Overview" } : null,
          { id: "map", label: "Requisite map" },
          { id: "reviews", label: "Reviews" },
          a.curriculum.length > 0
            ? { id: "structure", label: "Structure" }
            : null,
          a.courses.length > 0 ? { id: "courses", label: "Courses" } : null,
          a.specialStatements ? { id: "notes", label: "Notes" } : null,
          a.learningOutcomes.length > 0
            ? { id: "outcomes", label: "Learning outcomes" }
            : null,
          a.contacts.length > 0 ? { id: "contacts", label: "Contacts" } : null,
          { id: "details", label: "Details" },
        ]}
      >
        {a.description ? (
          <Section id="overview" title="Overview" icon={BookOpenIcon}>
            <Prose
              html={a.description}
              linkYear={linkYear}
              className="text-[15px]"
            />
          </Section>
        ) : null}

        <Section id="map" title="Requisite map" icon={NetworkIcon}>
          <EntityGraph
            initial={graph}
            year={r.year}
            linkYear={linkYear}
            emptyText={`None of the units in ${a.title} have prerequisites in the ${r.year} handbook.`}
          />
        </Section>

        <ReviewsSection
          kind="aos"
          code={a.code}
          title={a.title}
          data={reviews}
        />

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
          <Section id="outcomes" title="Learning outcomes" icon={TargetIcon}>
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
            "@type": "WebPage",
            name: `${a.title} (${a.code})`,
            description: truncate(stripHtml(a.description), 500) || undefined,
            url: absoluteUrl(r.canonical),
            about: {
              "@type": "CollegeOrUniversity",
              name: "Monash University",
              sameAs: "https://www.monash.edu/",
            },
            sameAs: monashHandbookUrl("aos", a.code, r.year),
          },
          breadcrumbLd([
            { name: "Search", path: "/search" },
            { name: "Areas of study", path: "/search?type=aos" },
            { name: `${a.title} (${a.code})`, path: r.canonical },
          ]),
        ]}
      />
    </HandbookMain>
  )
}
