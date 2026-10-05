import { MessageSquareTextIcon } from "lucide-react"
import { cache } from "react"

import { Section } from "@/components/handbook/frame"
import {
  listPublicReviews,
  type PublicReview,
  reviewSummary,
  type ReviewSummary,
} from "@/lib/db/reviews"
import { REVIEW_AXES, type ReviewKind } from "@/lib/reviews/axes"
import { reviewCount } from "@/lib/reviews/format"
import { cn } from "@/lib/utils"

import { ReviewsClient } from "./reviews-client"
import { formatRating } from "@/lib/reviews/format"

import { RatingInline, Stars } from "./stars"

const FIRST_PAGE = 5

export interface EntityReviews {
  summary: ReviewSummary
  reviews: PublicReview[]
}

/**
 * The summary and first reviews for a page. Wrapped in `cache` so the
 * hero, the structured data and the section share one read per render.
 */
export const fetchEntityReviews = cache(
  async (kind: ReviewKind, code: string): Promise<EntityReviews> => {
    const [summary, reviews] = await Promise.all([
      reviewSummary(kind, code),
      listPublicReviews(kind, code, { limit: FIRST_PAGE }),
    ])
    return { summary, reviews }
  }
)

/** The "Reviews" section of a unit, course or area of study page. */
export function ReviewsSection({
  kind,
  code,
  title,
  data,
}: {
  kind: ReviewKind
  code: string
  title: string
  data: EntityReviews
}) {
  const { summary, reviews } = data
  return (
    <Section
      id="reviews"
      title="Reviews"
      icon={MessageSquareTextIcon}
      action={<RatingInline summary={summary} size="md" />}
    >
      <div className="flex flex-col gap-6">
        {summary.count > 0 ? <Summary kind={kind} summary={summary} /> : null}
        <ReviewsClient
          kind={kind}
          code={code}
          title={title}
          initial={reviews}
          total={summary.count}
        />
      </div>
    </Section>
  )
}

function Summary({
  kind,
  summary,
}: {
  kind: ReviewKind
  summary: ReviewSummary
}) {
  const axes = REVIEW_AXES[kind].filter((a) => summary.axes[a.id])
  const max = Math.max(...summary.distribution, 1)
  return (
    <div className="grid gap-6 rounded-control border p-4 sm:p-5 md:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col items-start gap-1 md:pr-2">
        <span className="text-5xl leading-none font-semibold tabular-nums">
          {formatRating(summary.average ?? 0)}
        </span>
        <Stars value={summary.average ?? 0} size="md" />
        <span className="text-xs text-muted-foreground">
          {reviewCount(summary.count)}
        </span>
      </div>

      <ol className="flex flex-col gap-1" aria-label="Reviews by rating">
        {[5, 4, 3, 2, 1].map((star) => {
          const n = summary.distribution[star - 1]
          return (
            <li
              key={star}
              className="grid grid-cols-[1.25rem_minmax(0,1fr)_2rem] items-center gap-2 text-xs text-muted-foreground tabular-nums"
            >
              <span aria-hidden>{star}</span>
              <span
                aria-hidden
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="block h-full rounded-full bg-star"
                  style={{ width: `${(n / max) * 100}%` }}
                />
              </span>
              <span className="text-right">
                <span className="sr-only">
                  {star} {star === 1 ? "star" : "stars"}:{" "}
                </span>
                {n}
              </span>
            </li>
          )
        })}
      </ol>

      {axes.length > 0 ? (
        <dl className="flex flex-col gap-2 md:col-span-2 lg:col-span-1">
          {axes.map((a) => {
            const { average, count } = summary.axes[a.id]
            return (
              <div
                key={a.id}
                className="grid grid-cols-[minmax(6.5rem,auto)_minmax(0,1fr)] items-center gap-3 text-xs"
              >
                <dt className="text-muted-foreground">{a.label}</dt>
                <dd className="flex min-w-0 items-center gap-2">
                  {a.type === "stars" ? (
                    <>
                      <Stars value={average} size="xs" />
                      <span className="font-semibold tabular-nums">
                        {formatRating(average)}
                      </span>
                      <span className="sr-only">
                        out of 5 from {reviewCount(count)}
                      </span>
                    </>
                  ) : (
                    <ScaleBar value={average} steps={a.steps ?? []} />
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      ) : null}
    </div>
  )
}

/** A 1-5 track with a marker at the mean, and the nearest step's word. */
function ScaleBar({
  value,
  steps,
}: {
  value: number
  steps: readonly string[]
}) {
  const word = steps[Math.round(value) - 1] ?? ""
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span
        aria-hidden
        className="relative h-1.5 w-full max-w-28 rounded-full bg-muted"
      >
        <span
          className={cn(
            "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground"
          )}
          style={{ left: `${((value - 1) / 4) * 100}%` }}
        />
      </span>
      <span className="font-semibold whitespace-nowrap">{word}</span>
    </span>
  )
}
