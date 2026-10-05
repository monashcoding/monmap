"use client"

import { useId, useState, useTransition } from "react"

import { type ReviewInput, saveReviewAction } from "@/app/review-actions"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { PublicReview } from "@/lib/reviews/types"
import {
  BODY_MAX,
  BODY_MIN,
  OVERALL_LABELS,
  REVIEW_AXES,
  type ReviewKind,
} from "@/lib/reviews/axes"

import { ScaleInput, StarInput } from "./star-input"

const PLACEHOLDER: Record<ReviewKind, string> = {
  unit: "What should other students know? Think teaching, assessments, workload, and tips for doing well.",
  course:
    "What should future students know? Think teaching, flexibility, career prospects and student life.",
  aos: "What should other students know? Think the units, teaching, and where it leads.",
}

/**
 * Write or edit a review. The overall stars and the text are required;
 * the axes and the year are optional.
 */
export function ReviewForm({
  kind,
  code,
  initial,
  startOverall,
  onSaved,
  onCancel,
}: {
  kind: ReviewKind
  code: string
  initial: PublicReview | null
  /** The star the student clicked to open the form. */
  startOverall?: number | null
  onSaved: (review: PublicReview) => void
  onCancel: () => void
}) {
  const id = useId()
  const [overall, setOverall] = useState<number | null>(
    initial?.overall ?? startOverall ?? null
  )
  const [ratings, setRatings] = useState<Record<string, number>>(
    initial?.ratings ?? {}
  )
  const [body, setBody] = useState(initial?.body ?? "")
  const [yearTaken, setYearTaken] = useState(initial?.yearTaken ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const thisYear = new Date().getFullYear()
  const years = Array.from({ length: 12 }, (_, i) => String(thisYear - i))
  const length = body.trim().length
  const axes = REVIEW_AXES[kind]

  const setAxis = (axis: string, v: number | null) =>
    setRatings((r) => {
      const next = { ...r }
      if (v == null) delete next[axis]
      else next[axis] = v
      return next
    })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (overall == null) {
      setError("Choose an overall rating.")
      return
    }
    if (length < BODY_MIN) {
      setError(`Write at least ${BODY_MIN} characters.`)
      return
    }
    setError(null)
    const input: ReviewInput = {
      kind,
      code,
      overall,
      ratings,
      body,
      yearTaken: yearTaken || null,
    }
    startTransition(async () => {
      const res = await saveReviewAction(input)
      if (res.ok) onSaved(res.review)
      else setError(res.message)
    })
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-5 rounded-control border bg-muted/30 p-4 sm:p-5"
      aria-labelledby={`${id}-title`}
    >
      <h3 id={`${id}-title`} className="text-base font-semibold">
        {initial ? "Edit your review" : `Review ${code}`}
      </h3>

      <div className="flex flex-col gap-1.5">
        <span id={`${id}-overall`} className="text-sm font-medium">
          Overall rating
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <StarInput
            value={overall}
            onChange={setOverall}
            label="Overall rating"
            size="lg"
          />
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {overall ? OVERALL_LABELS[overall - 1] : "Required"}
          </span>
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">
          Rate the details{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </legend>
        <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
          {axes.map((a) => (
            <div key={a.id} className="flex flex-col gap-1">
              <span className="text-sm">{a.label}</span>
              <span
                id={`${id}-${a.id}-hint`}
                className="text-xs text-muted-foreground"
              >
                {a.hint}
              </span>
              {a.type === "stars" ? (
                <StarInput
                  value={ratings[a.id] ?? null}
                  onChange={(v) => setAxis(a.id, v)}
                  label={a.label}
                  describedBy={`${id}-${a.id}-hint`}
                />
              ) : (
                <ScaleInput
                  value={ratings[a.id] ?? null}
                  onChange={(v) => setAxis(a.id, v)}
                  label={a.label}
                  steps={a.steps ?? []}
                  describedBy={`${id}-${a.id}-hint`}
                />
              )}
            </div>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-year`} className="text-sm font-medium">
          {kind === "unit" ? "Year you took it" : "Year you started"}{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <select
          id={`${id}-year`}
          value={yearTaken}
          onChange={(e) => setYearTaken(e.target.value)}
          className="h-9 w-40 rounded-control border border-input bg-field px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <option value="">Rather not say</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-body`} className="text-sm font-medium">
          Your review
        </label>
        <Textarea
          id={`${id}-body`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={BODY_MAX}
          rows={5}
          placeholder={PLACEHOLDER[kind]}
          aria-describedby={`${id}-body-help`}
          className="min-h-32 bg-card"
        />
        <div
          id={`${id}-body-help`}
          className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"
        >
          <span>
            Others see your initials only. Leave out contact details and
            anything about people&apos;s private lives. Comments on teaching are
            fine.
          </span>
          <span className="tabular-nums">
            {length < BODY_MIN
              ? `${BODY_MIN - length} more characters needed`
              : `${length}/${BODY_MAX}`}
          </span>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : initial ? "Save changes" : "Post review"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
