import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { SearchIcon } from "lucide-react"

import { AppHeader } from "@/components/app-header"
import { KindBadge } from "@/components/handbook/frame"
import { ReviewAvatar } from "@/components/reviews/review-avatar"
import { Stars } from "@/components/reviews/stars"
import { getCurrentUser } from "@/lib/auth-server"
import {
  ADMIN_PAGE_SIZE,
  type AdminFilter,
  type AdminReview,
  adminStatusCounts,
  listReviewsForAdmin,
} from "@/lib/db/reviews"
import { entityHref } from "@/lib/handbook/links"
import { isReviewAdmin } from "@/lib/reviews/admin"
import { REVIEW_AXES } from "@/lib/reviews/axes"
import { reviewDate } from "@/lib/reviews/format"
import { cn } from "@/lib/utils"

import { ModerationActions } from "./moderation-actions"

export const metadata: Metadata = {
  title: "Review moderation",
  robots: { index: false, follow: false },
}

const FILTERS: Array<{ id: AdminFilter; label: string; hint: string }> = [
  { id: "all", label: "All", hint: "Every review" },
  {
    id: "flagged",
    label: "Flagged",
    hint: "The classifier hid these. Only their authors see them.",
  },
  {
    id: "unchecked",
    label: "Unchecked",
    hint: "The classifier was down, so these went live without a check.",
  },
  {
    id: "shadowbanned",
    label: "Shadowbanned",
    hint: "An admin hid these. Only their authors see them.",
  },
  { id: "published", label: "Published", hint: "Everyone sees these." },
]

const STATUS_STYLE: Record<AdminReview["status"], string> = {
  published: "bg-success-soft text-success-foreground",
  flagged: "bg-warning-soft text-warning-foreground",
  shadowbanned: "bg-destructive/10 text-destructive",
}

type Params = Promise<Record<string, string | string[] | undefined>>

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? ""
}

/**
 * Every review, for the admins in REVIEW_ADMIN_EMAILS. Everyone else
 * gets a 404, so the page doesn't reveal that it exists. Authors show
 * as initials and an anonymous tag only: admins judge the review, not
 * the person.
 */
export default async function ReviewModerationPage({
  searchParams,
}: {
  searchParams: Params
}) {
  const user = await getCurrentUser()
  if (!user || !isReviewAdmin(user.email)) notFound()

  const sp = await searchParams
  const rawFilter = one(sp.status)
  const filter: AdminFilter = FILTERS.some((f) => f.id === rawFilter)
    ? (rawFilter as AdminFilter)
    : "flagged"
  const q = one(sp.q).trim().slice(0, 100)
  const page = Math.max(1, Number.parseInt(one(sp.page), 10) || 1)

  const [{ reviews, total }, counts] = await Promise.all([
    listReviewsForAdmin(filter, q, (page - 1) * ADMIN_PAGE_SIZE),
    adminStatusCounts(),
  ])
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))
  const href = (over: Record<string, string | number | null>) => {
    const p = new URLSearchParams()
    const next = { status: filter, q, page: 1, ...over }
    if (next.status && next.status !== "flagged")
      p.set("status", String(next.status))
    if (next.q) p.set("q", String(next.q))
    if (next.page && next.page !== 1) p.set("page", String(next.page))
    const s = p.toString()
    return s ? `/admin/reviews?${s}` : "/admin/reviews"
  }
  const active = FILTERS.find((f) => f.id === filter)!

  return (
    <main className="mx-auto flex min-h-svh max-w-[1500px] flex-col gap-3 px-3 pt-3 pb-12 sm:gap-5 sm:px-5 sm:pt-5">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 sm:gap-5">
        <header className="flex flex-col gap-4 rounded-panel border bg-card p-5 shadow-card sm:p-7">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">Review moderation</h1>
            <p className="text-sm text-muted-foreground">
              Shadowbanned and flagged reviews stay visible to their authors and
              to no one else.
            </p>
          </div>
          <nav aria-label="Review status" className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Link
                key={f.id}
                href={href({ status: f.id })}
                aria-current={f.id === filter ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-control border px-3 py-1.5 text-sm",
                  f.id === filter
                    ? "border-transparent bg-primary font-semibold text-primary-foreground"
                    : "bg-card hover:bg-muted"
                )}
              >
                {f.label}
                <span className="text-xs tabular-nums opacity-70">
                  {counts[f.id]}
                </span>
              </Link>
            ))}
          </nav>
          <form action="/admin/reviews" className="flex max-w-md gap-2">
            {filter !== "flagged" ? (
              <input type="hidden" name="status" value={filter} />
            ) : null}
            <label className="sr-only" htmlFor="admin-q">
              Search reviews
            </label>
            <div className="relative flex-1">
              <SearchIcon
                className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                id="admin-q"
                name="q"
                defaultValue={q}
                placeholder="Code or words in the review"
                className="h-9 w-full rounded-control border border-input bg-field pr-3 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              />
            </div>
            <button
              type="submit"
              className="h-9 rounded-control border px-3 text-sm hover:bg-muted"
            >
              Search
            </button>
          </form>
        </header>

        <section
          aria-label={`${active.label} reviews`}
          className="flex flex-col gap-3"
        >
          <p className="px-1 text-sm text-muted-foreground">
            {total.toLocaleString("en-AU")} {total === 1 ? "review" : "reviews"}
            {q ? ` matching "${q}"` : ""}. {active.hint}
          </p>
          {reviews.length === 0 ? (
            <p className="rounded-panel border bg-card px-5 py-10 text-center text-sm text-muted-foreground shadow-card">
              Nothing here.
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {reviews.map((r) => (
                <li key={r.id}>
                  <AdminReviewCard review={r} />
                </li>
              ))}
            </ol>
          )}
          {pageCount > 1 ? (
            <nav
              aria-label="Pages"
              className="flex items-center justify-between gap-3 px-1 text-sm"
            >
              {page > 1 ? (
                <Link href={href({ page: page - 1 })} className="underline">
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground">
                Page {page} of {pageCount}
              </span>
              {page < pageCount ? (
                <Link href={href({ page: page + 1 })} className="underline">
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  )
}

function AdminReviewCard({ review: r }: { review: AdminReview }) {
  const nonFair =
    r.classifierScores && typeof r.classifierScores["fair review"] === "number"
      ? 1 - r.classifierScores["fair review"]
      : null
  const axes = REVIEW_AXES[r.kind].filter((a) => r.ratings[a.id] != null)
  return (
    <article className="flex flex-col gap-3 rounded-panel border bg-card p-4 shadow-card sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <Link
          href={`${entityHref(r.kind, r.code)}#reviews`}
          className="group flex min-w-0 flex-col gap-1"
        >
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <KindBadge kind={r.kind} />
            <span className="font-semibold tabular-nums">{r.code}</span>
          </span>
          <span className="text-sm font-medium underline-offset-2 group-hover:underline">
            {r.title ?? r.code}
          </span>
        </Link>
        <span
          className={cn(
            "rounded-tag px-2 py-0.5 text-xs font-semibold capitalize",
            STATUS_STYLE[r.status]
          )}
        >
          {r.status}
        </span>
      </header>

      <div className="flex items-center gap-3">
        <ReviewAvatar initials={r.initials} size={32} />
        <div className="flex flex-col text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{r.initials}</span>
          <span>
            Author #{r.authorTag} · {r.authorReviews}{" "}
            {r.authorReviews === 1 ? "review" : "reviews"} ·{" "}
            {reviewDate(r.createdAt)}
            {r.edited ? " · edited" : ""}
          </span>
        </div>
        <Stars value={r.overall} size="sm" className="ml-auto" />
      </div>

      <p className="text-sm leading-relaxed whitespace-pre-line">{r.body}</p>

      {axes.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {axes
            .map((a) =>
              a.type === "stars"
                ? `${a.label} ${r.ratings[a.id]}/5`
                : `${a.label}: ${a.steps?.[r.ratings[a.id] - 1]}`
            )
            .join(" · ")}
        </p>
      ) : null}

      <div className="flex flex-col gap-1 rounded-control bg-muted/50 px-3 py-2 text-xs">
        {r.classifierError ? (
          <span>
            <span className="font-semibold">Classifier down</span> (
            {r.classifierError}). Published without a check.
          </span>
        ) : r.classifierLabel ? (
          <span>
            <span className="font-semibold">Classifier:</span>{" "}
            {r.classifierLabel}
            {nonFair != null
              ? ` · ${Math.round(nonFair * 100)}% not a fair review`
              : ""}
          </span>
        ) : null}
        {r.moderatedBy ? (
          <span className="text-muted-foreground">
            Last set by {r.moderatedBy}
            {r.moderatedAt ? ` in ${reviewDate(r.moderatedAt)}` : ""}
          </span>
        ) : null}
      </div>

      <ModerationActions
        id={r.id}
        status={r.status}
        authorReviews={r.authorReviews}
      />
    </article>
  )
}
