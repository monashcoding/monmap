import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRightIcon, MessageSquareTextIcon } from "lucide-react"

import { AppHeader } from "@/components/app-header"
import { GoogleSignInButton } from "@/components/google-sign-in-button"
import { KindBadge } from "@/components/handbook/frame"
import { ReviewCard } from "@/components/reviews/review-card"
import { getCurrentUser } from "@/lib/auth-server"
import { listUserReviews } from "@/lib/db/reviews"
import { entityHref } from "@/lib/handbook/links"
import { reviewCount } from "@/lib/reviews/format"

export const metadata: Metadata = {
  title: "My reviews",
  robots: { index: false, follow: false },
}

/**
 * The signed-in student's reviews. Each shows as it does on its page,
 * whatever moderation decided: hidden reviews look published to their
 * author.
 */
export default async function MyReviewsPage() {
  const user = await getCurrentUser()
  const reviews = user ? await listUserReviews(user.id) : []

  return (
    // Same frame as every other page, so the header keeps its width;
    // the reviews sit in a narrower reading column inside it.
    <main className="mx-auto flex min-h-svh max-w-[1500px] flex-col gap-3 px-3 pt-3 pb-12 sm:gap-5 sm:px-5 sm:pt-5">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3 rounded-panel border bg-card p-5 shadow-card sm:p-7">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">My reviews</h1>
            <p className="text-sm text-muted-foreground">
              Others see your initials only.
            </p>
          </div>
          {reviews.length > 0 ? (
            <span className="text-sm text-muted-foreground">
              {reviewCount(reviews.length)}
            </span>
          ) : null}
        </header>

        {!user ? (
          <div className="flex flex-col items-center gap-4 rounded-panel border bg-card px-5 py-14 text-center shadow-card">
            <p className="text-base font-semibold">
              Sign in to see your reviews
            </p>
            <GoogleSignInButton callbackURL="/my-reviews" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-panel border bg-card px-5 py-14 text-center shadow-card">
            <span className="flex size-10 items-center justify-center rounded-control bg-primary text-primary-foreground">
              <MessageSquareTextIcon className="size-5" aria-hidden />
            </span>
            <p className="text-base font-semibold">No reviews yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Rate the units you have taken from their pages. Your reviews help
              other students plan.
            </p>
            <Link
              href="/search?type=units"
              className="text-sm font-medium text-info-foreground underline-offset-2 hover:underline"
            >
              Search units
            </Link>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {reviews.map((r) => (
              <li
                key={r.id}
                className="overflow-hidden rounded-panel border bg-card shadow-card"
              >
                <Link
                  href={`${entityHref(r.kind, r.code)}#reviews`}
                  className="group flex items-center gap-3 border-b px-4 py-3 hover:bg-muted/40 sm:px-5"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <KindBadge kind={r.kind} />
                      <span className="font-semibold tabular-nums">
                        {r.code}
                      </span>
                    </span>
                    <span className="truncate text-sm font-medium underline-offset-2 group-hover:underline">
                      {r.title ?? r.code}
                    </span>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    Edit
                    <ChevronRightIcon className="size-4" aria-hidden />
                  </span>
                </Link>
                <ReviewCard
                  review={r}
                  kind={r.kind}
                  className="px-4 py-4 sm:px-5"
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  )
}
