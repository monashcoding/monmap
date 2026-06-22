import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { TreeView } from "@/components/tree/tree-view"
import { fetchPublicCourse, listMostRecentYear } from "@/lib/db/public-queries"
import {
  fetchCourseWithAoS,
  listAvailableYears,
  listCoursesForPicker,
} from "@/lib/db/queries"
import type { PlannerCourseWithAoS } from "@/lib/planner/types"
import type { TreeControlsValue } from "@/lib/tree/payload"
import { prefetchTreeData } from "@/lib/tree/prefetch"
import type { TreeDirection } from "@/lib/tree/types"
import { absoluteUrl, siteUrl } from "@/lib/seo"

// Lazy ISR: see /units/[code] for the rationale. Same policy here —
// ~500 course pages cached for 7 days, busted via the `handbook` tag.
// 24h caused excessive ISR write churn; tag invalidation is the primary
// freshness mechanism when ingest runs.
export const revalidate = 604800
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
  const course = await fetchPublicCourse(upper, year)
  if (!course) {
    return {
      title: `${upper} not found`,
      robots: { index: false, follow: false },
    }
  }
  const aos = course.areasOfStudy.length
  const description = `${course.title} (${course.code}, ${course.creditPoints} cp${
    course.aqfLevel ? `, AQF ${course.aqfLevel}` : ""
  }) — visual course map for Monash University. ${aos} attached area${aos === 1 ? "" : "s"} of study.`
  const path = `/courses/${course.code}`
  return {
    title: `${course.title} (${course.code})`,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${course.title} — Monash`,
      description,
      type: "article",
      url: path,
    },
    twitter: {
      card: "summary_large_image",
      title: `${course.title} — Monash`,
      description,
    },
  }
}

/**
 * `/courses/[code]` is an **exact replica of the /tree workbench**,
 * pre-seeded with this course (and optionally an AoS via ?aos=). Same
 * controls, same graph, same side panel as /tree — only the URL is
 * canonical. The client component keeps the URL in sync as the user
 * navigates the picker (see TreeView's history.replaceState sync).
 */
export default async function CourseTreePage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const upper = code.toUpperCase()

  // No `searchParams` — see /units/[code]/page.tsx for the rationale.
  // Awaiting searchParams forces dynamic rendering, which is
  // incompatible with the `revalidate = 86400` ISR caching that makes
  // these pages cheap on Vercel. Deep-links like `?aos=...` are still
  // picked up client-side by TreeView via window.location.
  const availableYears = await listAvailableYears()
  const fallbackYear = (await listMostRecentYear()) ?? availableYears.at(-1)
  const year = fallbackYear!

  const course = await fetchPublicCourse(upper, year)
  if (!course) notFound()

  const direction: TreeDirection = "upstream"

  const initialControls: TreeControlsValue = {
    mode: "course",
    courseCode: course.code,
    aosCode: null,
    unitCode: null,
    direction,
    year,
    useMyPlan: false,
  }

  const [initial, courses, initialCourse] = await Promise.all([
    prefetchTreeData(initialControls),
    listCoursesForPicker(null, 500, year),
    fetchCourseWithAoS(
      course.code,
      year
    ) as Promise<PlannerCourseWithAoS | null>,
  ])

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
        initialEntityDetails={{ unit: null, course }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "EducationalOccupationalProgram",
            name: course.title,
            programType: course.type ?? undefined,
            educationalCredentialAwarded: course.aqfLevel
              ? `AQF level ${course.aqfLevel}`
              : undefined,
            identifier: course.code,
            url: `${siteUrl}/courses/${course.code}`,
            provider: {
              "@type": "CollegeOrUniversity",
              name: "Monash University",
              sameAs: "https://www.monash.edu/",
            },
            offers: {
              "@type": "Offer",
              category: "Tuition",
              availability: "https://schema.org/InStock",
            },
            occupationalCategory: course.school ?? undefined,
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
                name: course.code,
                item: absoluteUrl(`/courses/${course.code}`),
              },
            ],
          }),
        }}
      />
    </>
  )
}
