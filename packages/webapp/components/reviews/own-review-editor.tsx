"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { getMyReviewAction } from "@/app/review-actions"
import { GoogleSignInButton } from "@/components/google-sign-in-button"
import type { ReviewKind } from "@/lib/reviews/axes"
import type { PublicReview } from "@/lib/reviews/types"

import { ReviewForm } from "./review-form"

/** The toast after a student saves their review. */
export function toastReviewSaved(updated: boolean) {
  toast.success(updated ? "Review updated" : "Review posted", {
    description: "Thanks for helping other students.",
  })
}

type Own =
  | { key: string; signedIn: false }
  | { key: string; signedIn: true; review: PublicReview | null }

/**
 * The student's own review of one entity, in a form: it loads the saved
 * review to edit, or asks a signed-out visitor to sign in. Used where
 * the entity's page is not open, such as a dialog.
 */
export function OwnReviewEditor({
  kind,
  code,
  onSaved,
  onCancel,
}: {
  kind: ReviewKind
  code: string
  onSaved: (review: PublicReview) => void
  onCancel: () => void
}) {
  const pathname = usePathname()
  const key = `${kind} ${code}`
  const [own, setOwn] = useState<Own | null>(null)

  useEffect(() => {
    let cancelled = false
    void getMyReviewAction(kind, code).then((r) => {
      if (!cancelled) setOwn({ key, ...r })
    })
    return () => {
      cancelled = true
    }
  }, [key, kind, code])

  if (own?.key !== key) {
    return <div className="h-48 animate-pulse rounded-control bg-muted/50" />
  }
  if (!own.signedIn) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">
          Sign in to rate it. Reviews show your initials only.
        </p>
        <GoogleSignInButton
          size="sm"
          callbackURL={pathname}
          label="Sign in to review"
        />
      </div>
    )
  }
  const existing = own.review
  return (
    <ReviewForm
      key={key}
      kind={kind}
      code={code}
      initial={existing}
      onCancel={onCancel}
      onSaved={(review) => {
        toastReviewSaved(existing != null)
        onSaved(review)
      }}
    />
  )
}
