"use client"

import { LoaderCircleIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { deleteReviewAction, getMyReviewAction } from "@/app/review-actions"
import { GoogleSignInButton } from "@/components/google-sign-in-button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useHydrated } from "@/hooks/use-hydrated"
import { fetchReviews } from "@/lib/api/client"
import { useSession } from "@/lib/auth-client"
import type { PublicReview, ReviewSort } from "@/lib/reviews/types"
import type { ReviewKind } from "@/lib/reviews/axes"

import { ReviewCard } from "./review-card"
import { ReviewForm } from "./review-form"
import { StarInput } from "./star-input"

const SORT_LABEL: Record<ReviewSort, string> = {
  recent: "Most recent",
  highest: "Highest rated",
  lowest: "Lowest rated",
}

type Mine =
  | { state: "loading" }
  | { state: "anonymous" }
  | { state: "ready"; review: PublicReview | null }

/** The server's answer for one user and page. */
type Own = { key: string; signedIn: boolean; review: PublicReview | null }

/**
 * The interactive part of a page's Reviews section: the visitor's own
 * review (or a prompt to write one), and the list with sorting and
 * "Show more". The page's HTML carries the first reviews, so search
 * engines and visitors without JavaScript see them too.
 *
 * The visitor's own review is fetched after load because the page HTML
 * is cached and shared. It always shows to its author, even when
 * moderation hid it from everyone else. Anonymous visitors, most of
 * the traffic, skip that request: the client session already says
 * there is no one to fetch for.
 */
export function ReviewsClient({
  kind,
  code,
  title,
  initial,
  total,
}: {
  kind: ReviewKind
  code: string
  title: string
  initial: PublicReview[]
  total: number
}) {
  const pathname = usePathname()
  const session = useSession()
  const hydrated = useHydrated()
  const userId = session.data?.user?.id
  const key = userId ? `${userId} ${kind} ${code}` : null
  const [own, setOwn] = useState<Own | null>(null)
  const [editing, setEditing] = useState(false)
  const [startOverall, setStartOverall] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sort, setSort] = useState<ReviewSort>("recent")
  const [list, setList] = useState(initial)
  // The sort `list` is in, which `sort` runs ahead of while a new sort
  // loads.
  const [listSort, setListSort] = useState<ReviewSort>("recent")
  const [prevInitial, setPrevInitial] = useState(initial)
  const [loading, startLoading] = useTransition()
  const [deleting, startDeleting] = useTransition()

  // A save or a moderation change re-renders the page with new
  // reviews; start the list again from them.
  if (initial !== prevInitial) {
    setPrevInitial(initial)
    setList(initial)
    setSort("recent")
    setListSort("recent")
  }

  useEffect(() => {
    if (!key) return
    let cancelled = false
    void getMyReviewAction(kind, code).then((r) => {
      if (!cancelled) setOwn({ key, ...r })
    })
    return () => {
      cancelled = true
    }
  }, [key, kind, code])

  // Better Auth refetches the session when the tab regains focus, and
  // for a signed-out visitor `isPending` is true again during that
  // refetch. Remember that the session resolved once, so the sign-in
  // prompt does not flip back to the skeleton each time.
  const [sessionKnown, setSessionKnown] = useState(false)
  if (!sessionKnown && !session.isPending) setSessionKnown(true)

  // Hold the skeleton until hydration, as the header's UserMenu does:
  // the session can resolve before this hydrates, and the first client
  // render must match the server's skeleton.
  let mine: Mine = { state: "loading" }
  if (hydrated && sessionKnown) {
    if (!key) mine = { state: "anonymous" }
    else if (own?.key === key)
      mine = own.signedIn
        ? { state: "ready", review: own.review }
        : { state: "anonymous" }
  }
  const setMyReview = (review: PublicReview | null) => {
    if (key) setOwn({ key, signedIn: true, review })
  }

  const myReview = mine.state === "ready" ? mine.review : null
  const others = list.filter((r) => r.id !== myReview?.id)
  const hasMore = list.length < total

  // The list requests run in parallel, so only the latest one may
  // write: a slow answer for an older sort, or a "Show more" page of
  // it, would otherwise land on the list for the new sort.
  const requestRef = useRef(0)
  const loadReviews = (
    sortBy: ReviewSort,
    offset: number,
    apply: (page: PublicReview[]) => void
  ) => {
    const id = ++requestRef.current
    startLoading(async () => {
      try {
        const page = await fetchReviews(kind, code, sortBy, offset)
        if (id === requestRef.current) apply(page)
      } catch {
        if (id !== requestRef.current) return
        // Put the select back on the sort the list is still in.
        setSort(listSort)
        toast.error("Couldn't load reviews. Try again.")
      }
    })
  }
  const changeSort = (next: ReviewSort) => {
    setSort(next)
    loadReviews(next, 0, (page) => {
      setList(page)
      setListSort(next)
    })
  }
  const showMore = () =>
    loadReviews(sort, list.length, (more) =>
      setList((l) => {
        const seen = new Set(l.map((r) => r.id))
        return [...l, ...more.filter((r) => !seen.has(r.id))]
      })
    )

  const remove = () =>
    startDeleting(async () => {
      const res = await deleteReviewAction(kind, code)
      setConfirmDelete(false)
      if (res.ok) {
        setMyReview(null)
        toast.success("Review deleted")
      } else {
        toast.error("Couldn't delete your review. Try again.")
      }
    })

  return (
    <div className="flex flex-col gap-5">
      {mine.state === "loading" ? (
        <div className="h-24 animate-pulse rounded-control bg-muted/50" />
      ) : mine.state === "anonymous" ? (
        <div className="flex flex-col items-start gap-3 rounded-control border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">
              {kind === "unit"
                ? `Taken ${code}? Help other students out.`
                : `Studied ${title}? Help other students out.`}
            </p>
            <p className="text-xs text-muted-foreground">
              Sign in to rate it. Reviews show your initials only.
            </p>
          </div>
          <GoogleSignInButton
            size="sm"
            callbackURL={`${pathname}#reviews`}
            label="Sign in to review"
          />
        </div>
      ) : editing ? (
        <ReviewForm
          kind={kind}
          code={code}
          initial={myReview}
          startOverall={startOverall}
          onCancel={() => setEditing(false)}
          onSaved={(review) => {
            setMyReview(review)
            setEditing(false)
            toast.success(myReview ? "Review updated" : "Review posted", {
              description: "Thanks for helping other students.",
            })
          }}
        />
      ) : myReview ? (
        <div className="rounded-control border bg-emphasis-soft/60 p-4">
          <ReviewCard
            review={myReview}
            kind={kind}
            mine
            actions={
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="max-md:h-10"
                  onClick={() => {
                    setStartOverall(null)
                    setEditing(true)
                  }}
                >
                  <PencilIcon className="size-3.5" aria-hidden />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="max-md:h-10"
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Delete your review"
                >
                  <Trash2Icon className="size-3.5" aria-hidden />
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-control border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">
              {kind === "unit" ? `Rate ${code}` : `Rate ${title}`}
            </p>
            <p className="text-xs text-muted-foreground">
              Pick a star to start your review.
            </p>
          </div>
          <StarInput
            value={null}
            label="Overall rating"
            size="lg"
            onChange={(v) => {
              setStartOverall(v)
              setEditing(true)
            }}
          />
        </div>
      )}

      {others.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">What students say</h3>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Sort by
              <select
                value={sort}
                onChange={(e) => changeSort(e.target.value as ReviewSort)}
                className="h-8 rounded-control border border-input bg-field px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 max-md:h-10"
              >
                {(Object.keys(SORT_LABEL) as ReviewSort[]).map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ul
            className="flex flex-col divide-y"
            aria-busy={loading || undefined}
          >
            {others.map((r) => (
              <li key={r.id} className="py-4 first:pt-1 last:pb-1">
                <ReviewCard review={r} kind={kind} />
              </li>
            ))}
          </ul>
          {hasMore ? (
            <Button
              variant="outline"
              className="self-start"
              onClick={showMore}
              disabled={loading}
            >
              {loading ? (
                <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
              ) : null}
              Show more reviews
            </Button>
          ) : null}
        </div>
      ) : total === 0 && !myReview ? (
        <p className="text-sm text-muted-foreground">
          No reviews yet. Be the first to review {code}.
        </p>
      ) : null}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your review?</AlertDialogTitle>
            <AlertDialogDescription>
              Your review of {code} will be removed. You can write a new one
              later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={remove}
              disabled={deleting}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
