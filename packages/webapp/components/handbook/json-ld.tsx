import { absoluteUrl } from "@/lib/seo"

/** Structured data for search engines. `<` is escaped so text can't close the tag. */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  )
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

/**
 * `aggregateRating` and `review` for a schema.org Course, from the
 * page's published reviews. Empty with no reviews, since Google rejects
 * a rating count of 0.
 */
export function ratingLd(
  summary: { average: number | null; count: number },
  reviews: Array<{
    overall: number
    body: string
    initials: string
    createdAt: string
  }>
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
