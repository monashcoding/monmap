import { StarIcon } from "lucide-react"

import type { RatingSummary } from "@/lib/reviews/types"
import { cn } from "@/lib/utils"

const SIZE = {
  xs: "size-3",
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
} as const

export type StarSize = keyof typeof SIZE

/**
 * Five stars filled to `value` (0-5, fractions allowed). Decorative:
 * callers give the number as text next to it or in an sr-only label.
 */
export function Stars({
  value,
  size = "sm",
  className,
}: {
  value: number
  size?: StarSize
  className?: string
}) {
  const pct = Math.max(0, Math.min(5, value)) * 20
  const row = (filled: boolean) =>
    [0, 1, 2, 3, 4].map((i) => (
      <StarIcon
        key={i}
        className={cn(
          SIZE[size],
          "shrink-0",
          filled
            ? "fill-star text-star"
            : "fill-muted text-border dark:fill-muted"
        )}
        strokeWidth={1.5}
      />
    ))
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex shrink-0 align-middle", className)}
    >
      <span className="flex gap-px">{row(false)}</span>
      <span
        className="absolute inset-y-0 left-0 flex gap-px overflow-hidden"
        style={{ width: `${pct}%` }}
      >
        {row(true)}
      </span>
    </span>
  )
}

export function formatRating(average: number): string {
  return average.toFixed(1)
}

export function ratingLabel(summary: RatingSummary): string {
  if (summary.count === 0 || summary.average == null) return "No reviews yet"
  return `Rated ${formatRating(summary.average)} out of 5 from ${summary.count} ${
    summary.count === 1 ? "review" : "reviews"
  }`
}

/**
 * Google Maps style: "4.3 ★★★★☆ (12)". With no reviews the stars stay
 * empty and the count reads "(0)", so every unit and course shows the
 * same shape.
 */
export function RatingInline({
  summary,
  size = "sm",
  className,
}: {
  summary: RatingSummary | null | undefined
  size?: StarSize
  className?: string
}) {
  const s = summary ?? { average: null, count: 0 }
  const has = s.count > 0 && s.average != null
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground tabular-nums",
        size === "md" && "text-sm",
        size === "lg" && "text-base",
        className
      )}
    >
      <span className="sr-only">{ratingLabel(s)}</span>
      {has ? (
        <span aria-hidden className="font-semibold text-foreground">
          {formatRating(s.average!)}
        </span>
      ) : null}
      <Stars value={has ? s.average! : 0} size={size} />
      <span aria-hidden>({s.count})</span>
    </span>
  )
}

/**
 * One star, the average and the count: "★ 4.3 (12)", or "☆ (0)" with
 * no reviews. For narrow rows where five stars don't fit.
 */
export function RatingCompact({
  summary,
  className,
}: {
  summary: RatingSummary | null | undefined
  className?: string
}) {
  const s = summary ?? { average: null, count: 0 }
  const has = s.count > 0 && s.average != null
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] whitespace-nowrap text-muted-foreground tabular-nums",
        className
      )}
    >
      <span className="sr-only">{ratingLabel(s)}</span>
      <StarIcon
        aria-hidden
        strokeWidth={1.5}
        className={cn(
          "size-2.5",
          has ? "fill-star text-star" : "fill-muted text-border"
        )}
      />
      {has ? (
        <span aria-hidden className="font-semibold text-foreground">
          {formatRating(s.average!)}
        </span>
      ) : null}
      <span aria-hidden>({s.count})</span>
    </span>
  )
}
