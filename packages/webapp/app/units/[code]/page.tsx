import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { TreeView } from "@/components/tree/tree-view"
import { fetchPublicUnit, listMostRecentYear } from "@/lib/db/public-queries"
import { listAvailableYears, listCoursesForPicker } from "@/lib/db/queries"
import type { PlannerCourseWithAoS } from "@/lib/planner/types"
import type { TreeControlsValue } from "@/lib/tree/payload"
import { prefetchTreeData } from "@/lib/tree/prefetch"
import type { TreeDirection } from "@/lib/tree/types"
import { absoluteUrl, siteUrl } from "@/lib/seo"

// Lazy ISR: don't pre-render every unit at build (5k+ pages would
// add ~90s to the build). First request per code renders + caches;
// subsequent hits serve the cached HTML for 24 h, or until the ingest
// CLI busts the `handbook` cache tag explicitly.
export const revalidate = 86400
export const dynamicParams = true

export async function generateStaticParams() {
  return []
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}): Promise<Metadata> {
  const { code } = await params
  const upper = code.toUpperCase()
  const year = await listMostRecentYear()
  const unit = await fetchPublicUnit(upper, year)
  if (!unit) {
    return {
      title: `${upper} not found`,
      robots: { index: false, follow: false },
    }
  }
  // `unit.level` already comes through as "Level 2" (the lite-ref
  // `.label`), so don't prefix another "level " — would produce
  // "level Level 2" in the snippet.
  const description = `${unit.code} ${unit.title} (${unit.creditPoints} cp${
    unit.level ? `, ${unit.level.toLowerCase()}` : ""
  }) — visual prereq map for Monash University. ${unit.requisites.length} prereq${unit.requisites.length === 1 ? "" : "s"}, unlocks ${unit.unlocks.length}.`
  const path = `/units/${unit.code}`
  return {
    title: `${unit.code} — ${unit.title}`,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${unit.code} ${unit.title}`,
      description,
      type: "article",
      url: path,
    },
    twitter: {
      card: "summary_large_image",
      title: `${unit.code} ${unit.title}`,
      description,
    },
  }
}

/**
 * `/units/[code]` is an **exact replica of the /tree workbench**,
 * pre-seeded with this unit. No bespoke layout — same controls, same
 * graph, same side panel. The only thing that's different is the URL
 * is canonical for SEO and shareability.
 *
 * The workbench client component then keeps the URL in sync as the
 * user picks other units/courses (see TreeView's history.replaceState
 * sync), so a session that drifts through the graph ends up on the
 * right canonical URL when shared or bookmarked.
 */
export default async function UnitTreePage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const upper = code.toUpperCase()

  // Deliberately no `searchParams` here. Awaiting searchParams in a
  // server component opts the route into dynamic mode — incompatible
  // with `revalidate = 86400` ISR, which is what makes these 5k+
  // entity pages cheap on Vercel. The canonical URL for SEO is the
  // bare `/units/[code]` anyway; deep-links like `?direction=upstream`
  // still work, the client just picks them up via window.location on
  // mount (see TreeView's URL-sync + initial-controls logic).
  const availableYears = await listAvailableYears()
  const fallbackYear = (await listMostRecentYear()) ?? availableYears.at(-1)
  const year = fallbackYear!

  // 404 if the unit doesn't exist in the chosen year — keeps URL space
  // honest and stops Googlebot from indexing typo'd paths.
  const unit = await fetchPublicUnit(upper, year)
  if (!unit) notFound()

  const direction: TreeDirection = "both"

  const initialControls: TreeControlsValue = {
    mode: "unit",
    courseCode: null,
    aosCode: null,
    unitCode: unit.code,
    direction,
    year,
    useMyPlan: false,
  }
  const initial = await prefetchTreeData(initialControls)
  const courses = await listCoursesForPicker(null, 500, year)
  // Unit mode doesn't need course-meta, but TreeView accepts null.
  const initialCourse: PlannerCourseWithAoS | null = null

  return (
    <>
      <TreeView
        availableYears={availableYears.length > 0 ? availableYears : [year]}
        courses={courses}
        initialCourse={initialCourse}
        initial={{
          controls: initialControls,
          graph: initial.graph,
          units: initial.units,
          offerings: initial.offerings,
          requisites: initial.requisites,
          enrolmentRules: initial.enrolmentRules,
        }}
        signedIn={false}
        activePlan={null}
        initialEntityDetails={{ unit, course: null }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Course",
            name: unit.title,
            courseCode: unit.code,
            identifier: unit.code,
            url: `${siteUrl}/units/${unit.code}`,
            inLanguage: "en",
            educationalLevel: unit.level ?? undefined,
            provider: {
              "@type": "CollegeOrUniversity",
              name: "Monash University",
              sameAs: "https://www.monash.edu/",
            },
            isAccessibleForFree: true,
            mainEntityOfPage: absoluteUrl(`/units/${unit.code}`),
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "MonMap",
                item: siteUrl,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Unit Tree",
                item: absoluteUrl("/tree"),
              },
              {
                "@type": "ListItem",
                position: 3,
                name: unit.code,
                item: absoluteUrl(`/units/${unit.code}`),
              },
            ],
          }),
        }}
      />
    </>
  )
}
