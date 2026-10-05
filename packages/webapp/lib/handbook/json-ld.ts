/**
 * schema.org structured data for the handbook pages. Pure, so node
 * tests can check the escaping that keeps review text inside its tag.
 */
import type { PublicReview, RatingSummary } from "../reviews/types.ts"
import { absoluteUrl } from "../seo.ts"

/**
 * JSON for a `<script type="application/ld+json">`. Every `<` is
 * escaped, so text such as a review body can't close the tag or open
 * an HTML comment.
 */
export function jsonLdHtml(data: object | object[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}

export function breadcrumbLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "MonMap",
        item: absoluteUrl("/"),
      },
      ...items.map((it, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: it.name,
        item: absoluteUrl(it.path),
      })),
    ],
  }
}

/** The `provider` of every unit, course and area of study. */
export const MONASH_PROVIDER = {
  "@type": "CollegeOrUniversity",
  name: "Monash University",
  sameAs: "https://www.monash.edu/",
}

/**
 * `aggregateRating` and `review` for a schema.org Course, from the
 * page's published reviews. Empty with no reviews, since Google rejects
 * a rating count of 0. Authors are named by their initials only.
 */
export function ratingLd(
  summary: RatingSummary,
  reviews: ReadonlyArray<
    Pick<PublicReview, "overall" | "body" | "initials" | "createdAt">
  >
): Record<string, unknown> {
  if (summary.count === 0 || summary.average == null) return {}
  return {
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: Number(summary.average.toFixed(2)),
      ratingCount: summary.count,
      bestRating: 5,
      worstRating: 1,
    },
    review: reviews.map((r) => ({
      "@type": "Review",
      reviewRating: {
        "@type": "Rating",
        ratingValue: r.overall,
        bestRating: 5,
        worstRating: 1,
      },
      author: { "@type": "Person", name: r.initials },
      datePublished: r.createdAt.slice(0, 10),
      reviewBody: r.body,
    })),
  }
}

/** ISO 8601 duration for "3 Years" / "18 Months", for structured data. */
export function isoDuration(text: string | null): string | undefined {
  const m = text?.match(/([\d.]+)\s*(year|month|week)/i)
  if (!m) return undefined
  const unit = { year: "Y", month: "M", week: "W" }[
    m[2].toLowerCase() as "year" | "month" | "week"
  ]
  return `P${m[1]}${unit}`
}
