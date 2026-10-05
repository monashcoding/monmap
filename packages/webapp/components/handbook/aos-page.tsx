import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { AOS_KIND_LABEL, fetchAosPage } from "@/lib/db/handbook"
import { entityHref, monashHandbookUrl } from "@/lib/handbook/links"
import { resolveEntity } from "@/lib/handbook/resolve"
import { absoluteUrl, stripHtml, truncate } from "@/lib/seo"
import { prefetchGraphForSeeds } from "@/lib/tree/prefetch"

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
  const a = await fetchAosPage(r.code, r.year)
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
        facts={[
          a.studyLevel,
          a.creditPoints ? `${a.creditPoints} credit points` : null,
          a.locations,
        ]}
        subtitle={a.school}
        breadcrumbs={[
          { label: "Search", href: "/search" },
          { label: "Areas of study", href: "/search?type=aos" },
          { label: a.code },
        ]}
        year={r.year}
        years={r.years}
        yearHref={yearHref}
        handbookUrl={monashHandbookUrl("aos", a.code, r.year)}
        notice={notice}
      />

      <SectionNav
        items={[
          a.description ? { id: "overview", label: "Overview" } : null,
          a.curriculum.length > 0
            ? { id: "structure", label: "Structure" }
            : null,
          a.courses.length > 0 ? { id: "courses", label: "Courses" } : null,
          a.learningOutcomes.length > 0
            ? { id: "outcomes", label: "Learning outcomes" }
            : null,
        ]}
      />

      <EntityGraph
        initial={graph}
        year={r.year}
        linkYear={linkYear}
        title="Requisite map"
        subtitle={`The units in ${a.title} and the prerequisites behind them. Click a unit to see its details.`}
        emptyText={`None of the units in ${a.title} have prerequisites in the ${r.year} handbook.`}
      />

      <DetailColumns
        main={
          <>
            {a.description ? (
              <Section id="overview" title="Overview">
                <Prose html={a.description} linkYear={linkYear} />
              </Section>
            ) : null}

            {a.curriculum.length > 0 ? (
              <Section id="structure" title="Structure">
                <CurriculumTree
                  nodes={a.curriculum}
                  linkYear={linkYear}
                  linkableUnits={new Set(a.linkableUnits)}
                />
              </Section>
            ) : null}

            {a.specialStatements ? (
              <Section id="notes" title="Notes">
                <Prose html={a.specialStatements} linkYear={linkYear} />
              </Section>
            ) : null}

            {a.learningOutcomes.length > 0 ? (
              <Section id="outcomes" title="Learning outcomes">
                {a.outcomesIntro ? (
                  <Prose
                    html={a.outcomesIntro}
                    linkYear={linkYear}
                    className="mb-3 text-muted-foreground"
                  />
                ) : null}
                <ol className="flex flex-col gap-2">
                  {a.learningOutcomes.map((o, i) => (
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
          </>
        }
        aside={
          <>
            <Section title={`${kindLabel} details`}>
              <FactList
                rows={[
                  { label: "Type", value: kindLabel },
                  a.studyLevel
                    ? { label: "Study level", value: a.studyLevel }
                    : null,
                  a.creditPoints
                    ? { label: "Credit points", value: a.creditPoints }
                    : null,
                  a.locations
                    ? { label: "Locations", value: a.locations }
                    : null,
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
            </Section>

            {a.courses.length > 0 ? (
              <Section
                id="courses"
                title={`Offered in ${a.courses.length} course${a.courses.length === 1 ? "" : "s"}`}
              >
                <EntityRows
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

            {a.contacts.length > 0 ? (
              <Section title="Contacts">
                <FactList
                  rows={a.contacts.map((x) => ({
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
