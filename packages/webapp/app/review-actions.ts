"use server"

import { fetchSessionName, getCurrentUser } from "@/lib/auth-server"
import { listEntityYears } from "@/lib/db/handbook"
import {
  countRecentReviews,
  deleteUserReview,
  getUserReview,
  listPublicReviews,
  type PublicReview,
  type RatingSummary,
  ratingSummaries,
  REVIEW_PAGE_SIZE,
  type ReviewSort,
  setReviewStatus,
  shadowbanAuthorOf,
  upsertReview,
} from "@/lib/db/reviews"
import { isReviewAdmin } from "@/lib/reviews/admin"
import {
  BODY_MAX,
  BODY_MIN,
  cleanRatings,
  isRating,
  isReviewKind,
  type ReviewKind,
} from "@/lib/reviews/axes"
import { moderateReview } from "@/lib/reviews/classifier"
import { reviewInitials } from "@/lib/reviews/initials"
import { revalidateReviewPages } from "@/lib/reviews/revalidate"

/**
 * Server actions for reviews. Every response carries only what the
 * public pages show (initials, never a name, email or user id). The
 * author's own review comes back without its status, so a flagged or
 * shadowbanned review looks published to them.
 */

const MAX_REVIEWS_PER_DAY = 20

function cleanCode(v: unknown): string | null {
  if (typeof v !== "string") return null
  const code = v.trim().toUpperCase()
  return /^[A-Z0-9-]{2,16}$/.test(code) ? code : null
}

export async function getMyReviewAction(
  kind: ReviewKind,
  rawCode: string
): Promise<{ signedIn: boolean; review: PublicReview | null }> {
  const code = cleanCode(rawCode)
  if (!isReviewKind(kind) || !code) return { signedIn: false, review: null }
  const u = await getCurrentUser()
  if (!u) return { signedIn: false, review: null }
  return { signedIn: true, review: await getUserReview(u.id, kind, code) }
}

export async function listReviewsAction(
  kind: ReviewKind,
  rawCode: string,
  sort: ReviewSort,
  offset: number
): Promise<PublicReview[]> {
  const code = cleanCode(rawCode)
  if (!isReviewKind(kind) || !code) return []
  const safeSort: ReviewSort = ["recent", "highest", "lowest"].includes(sort)
    ? sort
    : "recent"
  const safeOffset = Number.isInteger(offset)
    ? Math.min(Math.max(offset, 0), 10_000)
    : 0
  return listPublicReviews(kind, code, {
    sort: safeSort,
    offset: safeOffset,
    limit: REVIEW_PAGE_SIZE,
  })
}

/** Overall ratings for up to 300 codes, for lists rendered in the browser. */
export async function ratingSummariesAction(
  kind: ReviewKind,
  codes: string[]
): Promise<Record<string, RatingSummary>> {
  if (!isReviewKind(kind) || !Array.isArray(codes)) return {}
  const clean = codes
    .slice(0, 300)
    .map(cleanCode)
    .filter((c): c is string => c != null)
  return ratingSummaries(kind, clean)
}

export interface ReviewInput {
  kind: ReviewKind
  code: string
  overall: number
  ratings: Record<string, number>
  body: string
  yearTaken: string | null
}

export type SaveReviewResult =
  | { ok: true; review: PublicReview }
  | {
      ok: false
      reason: "unauthenticated" | "invalid" | "not_found" | "rate_limited"
      message: string
    }

export async function saveReviewAction(
  input: ReviewInput
): Promise<SaveReviewResult> {
  const u = await getCurrentUser()
  if (!u) {
    return {
      ok: false,
      reason: "unauthenticated",
      message: "Sign in to write a review.",
    }
  }
  const kind = input?.kind
  const code = cleanCode(input?.code)
  if (!isReviewKind(kind) || !code) {
    return { ok: false, reason: "invalid", message: "Unknown page." }
  }
  if (!isRating(input.overall)) {
    return {
      ok: false,
      reason: "invalid",
      message: "Choose an overall rating from 1 to 5 stars.",
    }
  }
  const body = typeof input.body === "string" ? input.body.trim() : ""
  if (body.length < BODY_MIN || body.length > BODY_MAX) {
    return {
      ok: false,
      reason: "invalid",
      message: `Write between ${BODY_MIN} and ${BODY_MAX} characters.`,
    }
  }
  const yearTaken =
    typeof input.yearTaken === "string" && /^\d{4}$/.test(input.yearTaken)
      ? input.yearTaken
      : null
  if ((await listEntityYears(kind, code)).length === 0) {
    return { ok: false, reason: "not_found", message: "Unknown page." }
  }
  const existing = await getUserReview(u.id, kind, code)
  if (!existing && (await countRecentReviews(u.id)) >= MAX_REVIEWS_PER_DAY) {
    return {
      ok: false,
      reason: "rate_limited",
      message: "You've written a lot of reviews today. Try again tomorrow.",
    }
  }

  const [name, moderation] = await Promise.all([
    fetchSessionName(),
    moderateReview(body),
  ])
  const saved = await upsertReview({
    userId: u.id,
    kind,
    code,
    overall: input.overall,
    ratings: cleanRatings(kind, input.ratings),
    body,
    yearTaken,
    initials: reviewInitials(name ?? u.name, u.email),
    moderation,
  })
  await revalidateReviewPages([{ kind, code }])
  return { ok: true, review: saved }
}

export async function deleteReviewAction(
  kind: ReviewKind,
  rawCode: string
): Promise<{ ok: boolean }> {
  const code = cleanCode(rawCode)
  if (!isReviewKind(kind) || !code) return { ok: false }
  const u = await getCurrentUser()
  if (!u) return { ok: false }
  const ok = await deleteUserReview(u.id, kind, code)
  if (ok) await revalidateReviewPages([{ kind, code }])
  return { ok }
}

/* ------------------------------------------------------------------ *
 * Admin
 * ------------------------------------------------------------------ */

async function requireAdmin(): Promise<string | null> {
  const u = await getCurrentUser()
  return u && isReviewAdmin(u.email) ? u.email : null
}

export async function moderateReviewAction(
  id: string,
  status: "published" | "shadowbanned"
): Promise<{ ok: boolean }> {
  const admin = await requireAdmin()
  if (!admin || typeof id !== "string") return { ok: false }
  if (status !== "published" && status !== "shadowbanned") return { ok: false }
  const targets = await setReviewStatus(id, status, admin)
  await revalidateReviewPages(targets)
  return { ok: targets.length > 0 }
}

export async function shadowbanAuthorAction(
  id: string
): Promise<{ ok: boolean; count: number }> {
  const admin = await requireAdmin()
  if (!admin || typeof id !== "string") return { ok: false, count: 0 }
  const targets = await shadowbanAuthorOf(id, admin)
  await revalidateReviewPages(targets)
  return { ok: true, count: targets.length }
}

/** Whether the signed-in user can open the moderation page. */
export async function isReviewAdminAction(): Promise<boolean> {
  return (await requireAdmin()) != null
}
