"use server"

import { fetchSessionName, getClaims, getCurrentUser } from "@/lib/auth-server"
import { listEntityYears } from "@/lib/db/handbook"
import {
  countRecentReviews,
  deleteUserReview,
  getUserReview,
  type PublicReview,
  setReviewStatus,
  shadowbanAuthorOf,
  upsertReview,
} from "@/lib/db/reviews"
import { isReviewAdmin } from "@/lib/reviews/admin"
import { isReviewKind, type ReviewKind } from "@/lib/reviews/axes"
import { moderateReview } from "@/lib/reviews/classifier"
import { reviewInitials } from "@/lib/reviews/initials"
import {
  cleanEntityCode,
  parseReviewInput,
  type ReviewInput,
  sameReviewContent,
} from "@/lib/reviews/input"
import { takeReviewWrite } from "@/lib/reviews/rate-limit"
import { revalidateReviewPages } from "@/lib/reviews/revalidate"

/**
 * Server actions for reviews: writes, moderation and the reads that
 * depend on the session. The public lists and ratings are GET routes
 * (app/api/reviews, app/api/ratings). Every response carries only what
 * the public pages show (initials, never a name, email or user id). The
 * author's own review comes back without its status, so a flagged or
 * shadowbanned review looks published to them. Input checks live in
 * lib/reviews/input.ts, where they are tested.
 */

const MAX_REVIEWS_PER_DAY = 20

export type { ReviewInput }

export async function getMyReviewAction(
  kind: ReviewKind,
  rawCode: string
): Promise<{ signedIn: boolean; review: PublicReview | null }> {
  const code = cleanEntityCode(rawCode)
  if (!isReviewKind(kind) || !code) return { signedIn: false, review: null }
  const claims = await getClaims()
  if (!claims) return { signedIn: false, review: null }
  return {
    signedIn: true,
    review: await getUserReview(claims.macUserId, kind, code),
  }
}

export type SaveReviewResult =
  | { ok: true; review: PublicReview }
  | {
      ok: false
      reason: "unauthenticated" | "invalid" | "not_found" | "rate_limited"
      message: string
    }

const RATE_LIMITED = {
  ok: false,
  reason: "rate_limited",
  message: "You're saving reviews too often. Wait a moment and try again.",
} as const

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
  const parsed = parseReviewInput(input)
  if (!parsed.ok) {
    return { ok: false, reason: "invalid", message: parsed.message }
  }
  const { kind, code, overall, ratings, body, yearTaken } = parsed.value
  if ((await listEntityYears(kind, code)).length === 0) {
    return { ok: false, reason: "not_found", message: "Unknown page." }
  }
  const existing = await getUserReview(u.id, kind, code)
  // Saving the same review again changes nothing: skip the classifier,
  // the write and the page revalidation.
  if (existing && sameReviewContent(existing, parsed.value)) {
    return { ok: true, review: existing }
  }
  if (!takeReviewWrite(u.id)) return RATE_LIMITED
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
    overall,
    ratings,
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
  const code = cleanEntityCode(rawCode)
  if (!isReviewKind(kind) || !code) return { ok: false }
  const claims = await getClaims()
  if (!claims || !takeReviewWrite(claims.macUserId)) return { ok: false }
  const ok = await deleteUserReview(claims.macUserId, kind, code)
  if (ok) await revalidateReviewPages([{ kind, code }])
  return { ok }
}

/* ------------------------------------------------------------------ *
 * Admin
 * ------------------------------------------------------------------ */

async function requireAdmin(): Promise<string | null> {
  const claims = await getClaims()
  return claims && isReviewAdmin(claims.email) ? claims.email : null
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
