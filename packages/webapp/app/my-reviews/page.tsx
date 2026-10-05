import type { Metadata } from "next"
import Link from "next/link"
import { MessageSquareTextIcon } from "lucide-react"

import { AppHeader } from "@/components/app-header"
import { GoogleSignInButton } from "@/components/google-sign-in-button"
import { KindBadge } from "@/components/handbook/parts"
import { ReviewAvatar } from "@/components/reviews/review-avatar"
import { Stars } from "@/components/reviews/stars"
import { getCurrentUser } from "@/lib/auth-server"
import { listUserReviews } from "@/lib/db/reviews"
import { entityHref } from "@/lib/handbook/links"
import { OVERALL_LABELS } from "@/lib/reviews/axes"
import { reviewDate } from "@/lib/reviews/format"

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
    <main className="mx-auto flex min-h-svh max-w-[900px] flex-col gap-3 px-3 pt-3 pb-12 sm:gap-5 sm:px-5 sm:pt-5">
      <AppHeader />
      <header className="flex flex-col gap-1 rounded-panel border bg-card p-5 shadow-card sm:p-7">
        <h1 className="text-2xl font-semibold">My reviews</h1>
        <p className="text-sm text-muted-foreground">
          Your reviews of units, courses and areas of study. Others see your
          initials only.
        </p>
      </header>

      {!user ? (
        <div className="flex flex-col items-center gap-4 rounded-panel border bg-card py-16 text-center shadow-card">
          <p className="text-base font-semibold">Sign in to see your reviews</p>
          <GoogleSignInButton callbackURL="/my-reviews" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-panel border bg-card py-16 text-center shadow-card">
          <MessageSquareTextIcon
            className="size-10 text-muted-foreground/40"
            aria-hidden
          />
          <p className="text-base font-semibold">No reviews yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Find a unit you have taken and rate it from its page.
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
              className="flex flex-col gap-2.5 rounded-panel border bg-card p-4 shadow-card sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`${entityHref(r.kind, r.code)}#reviews`}
                  className="flex items-center gap-2 text-sm font-semibold underline-offset-2 hover:underline"
                >
                  <KindBadge kind={r.kind} />
                  {r.code}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {reviewDate(r.createdAt)}
                  {r.edited ? " · edited" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ReviewAvatar initials={r.initials} size={28} />
                <Stars value={r.overall} size="sm" />
                <span className="text-xs font-medium">
                  {OVERALL_LABELS[r.overall - 1]}
                </span>
              </div>
              <p className="line-clamp-4 text-sm leading-relaxed whitespace-pre-line text-foreground/90">
                {r.body}
              </p>
              <Link
                href={`${entityHref(r.kind, r.code)}#reviews`}
                className="self-start text-xs font-medium text-info-foreground underline-offset-2 hover:underline"
              >
                Edit on the {r.kind === "aos" ? "area of study" : r.kind} page
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}
