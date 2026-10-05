"use client"

import { EyeIcon, EyeOffIcon, UserXIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import {
  moderateReviewAction,
  shadowbanAuthorAction,
} from "@/app/review-actions"
import { Button } from "@/components/ui/button"

/** Buttons on one review of the admin page. */
export function ModerationActions({
  id,
  status,
  authorReviews,
}: {
  id: string
  status: "published" | "flagged" | "shadowbanned"
  authorReviews: number
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<{ ok: boolean }>, done: string) =>
    start(async () => {
      const res = await fn()
      if (res.ok) {
        toast.success(done)
        router.refresh()
      } else {
        toast.error("That didn't work. Check you're still signed in.")
      }
    })

  return (
    <div className="flex flex-wrap gap-2">
      {status === "published" ? (
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() =>
            run(
              () => moderateReviewAction(id, "shadowbanned"),
              "Review shadowbanned"
            )
          }
        >
          <EyeOffIcon className="size-3.5" aria-hidden />
          Shadowban
        </Button>
      ) : (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => moderateReviewAction(id, "published"),
                "Review published"
              )
            }
          >
            <EyeIcon className="size-3.5" aria-hidden />
            Publish
          </Button>
          {status === "flagged" ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(
                  () => moderateReviewAction(id, "shadowbanned"),
                  "Review shadowbanned"
                )
              }
            >
              <EyeOffIcon className="size-3.5" aria-hidden />
              Keep hidden
            </Button>
          ) : null}
        </>
      )}
      {authorReviews > 1 ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            run(
              () => shadowbanAuthorAction(id),
              `Shadowbanned all ${authorReviews} reviews by this author`
            )
          }
        >
          <UserXIcon className="size-3.5" aria-hidden />
          Shadowban all {authorReviews} by this author
        </Button>
      ) : null}
    </div>
  )
}
