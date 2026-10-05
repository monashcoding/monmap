"use client"

import { StarIcon } from "lucide-react"
import { useState } from "react"

import type { PublicReview } from "@/lib/reviews/types"
import {
  OVERALL_LABELS,
  REVIEW_AXES,
  type ReviewKind,
} from "@/lib/reviews/axes"
import { reviewDate } from "@/lib/reviews/format"
import { cn } from "@/lib/utils"

import { ReviewAvatar } from "./review-avatar"
import { Stars } from "./stars"

const LONG = 420

/** One review: avatar and initials, stars, date, axis scores and text. */
export function ReviewCard({
  review,
  kind,
  mine = false,
  actions,
  className,
}: {
  review: PublicReview
  kind: ReviewKind
  /** The viewer wrote it: "(Your review)" follows the initials. */
  mine?: boolean
  actions?: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const long = review.body.length > LONG
  const axes = REVIEW_AXES[kind].filter((a) => review.ratings[a.id] != null)
  const yearWord = kind === "unit" ? "Took it in" : "Started in"

  return (
    <article className={cn("flex flex-col gap-2.5", className)}>
      <header className="flex items-center gap-3">
        <ReviewAvatar initials={review.initials} size={36} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold">
            {review.initials}
            {mine ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                (Your review)
              </span>
            ) : null}
          </span>
          <span className="text-xs text-muted-foreground">
            {reviewDate(review.createdAt)}
            {review.edited ? " · edited" : ""}
            {review.yearTaken ? ` · ${yearWord} ${review.yearTaken}` : ""}
          </span>
        </div>
        {actions}
      </header>

      <div className="flex items-center gap-2">
        <Stars value={review.overall} size="sm" />
        <span className="text-xs font-medium">
          <span className="sr-only">{review.overall} out of 5: </span>
          {OVERALL_LABELS[review.overall - 1]}
        </span>
      </div>

      <p
        className={cn(
          "text-sm leading-relaxed whitespace-pre-line text-foreground/90",
          long && !open && "line-clamp-5"
        )}
      >
        {review.body}
      </p>
      {long ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="self-start text-xs font-medium text-info-foreground underline-offset-2 hover:underline max-md:py-1"
        >
          {open ? "Show less" : "Read more"}
        </button>
      ) : null}

      {axes.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {axes.map((a) => {
            const v = review.ratings[a.id]
            return (
              <li
                key={a.id}
                className="inline-flex items-center gap-1 rounded-tag bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <span>{a.label}</span>
                {a.type === "stars" ? (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-foreground">
                    {v}
                    <StarIcon
                      aria-hidden
                      className="size-3 fill-star text-star"
                      strokeWidth={1.5}
                    />
                    <span className="sr-only">out of 5</span>
                  </span>
                ) : (
                  <span className="font-semibold text-foreground">
                    {a.steps?.[v - 1]}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}
    </article>
  )
}
