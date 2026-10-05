/**
 * How a save changes a review's status and moderation history. Kept
 * apart from the database code so `node --test` can check every case.
 */

import type { ModerationResult } from "./classifier.ts"

/** Mirrors the `review_status` enum in packages/db. */
export type ReviewStatus = "published" | "flagged" | "shadowbanned"

/**
 * The status a review gets when its author saves it.
 *
 * - An admin's decision wins: a shadowbanned review, or any review by a
 *   banned author, is shadowbanned.
 * - Otherwise the classifier decides. If it failed, a new or published
 *   review is published unchecked (see classifier.ts), but a flagged
 *   review stays flagged: an outage must not undo a flag.
 *
 * `previous` is null for a new review.
 */
export function statusAfterSave(
  previous: ReviewStatus | null,
  authorBanned: boolean,
  m: ModerationResult
): ReviewStatus {
  if (authorBanned || previous === "shadowbanned") return "shadowbanned"
  if (!m.ok) return previous === "flagged" ? "flagged" : "published"
  return m.flagged ? "flagged" : "published"
}

/** The moderation columns of the review row a save replaces. */
export interface PreviousReview {
  status: ReviewStatus
  deletedAt: Date | null
  moderatedBy: string | null
  moderatedAt: Date | null
}

/**
 * The moderation history a save leaves on the row (docs/reviews.md):
 *
 * - A hidden status kept from an admin or an earlier flag keeps its
 *   moderatedBy and moderatedAt.
 * - Any other save clears them. That includes an edit to a published
 *   review, because no admin has seen the new text.
 * - Writing a deleted review again revives it as a new review, so its
 *   createdAt resets. Its status is still kept (see statusAfterSave).
 *
 * `previous` is null for a new review.
 */
export function historyAfterSave(
  previous: PreviousReview | null,
  status: ReviewStatus
): {
  moderatedBy: string | null
  moderatedAt: Date | null
  resetCreatedAt: boolean
} {
  const kept =
    previous != null && previous.status === status && status !== "published"
  return {
    moderatedBy: kept ? previous.moderatedBy : null,
    moderatedAt: kept ? previous.moderatedAt : null,
    resetCreatedAt: previous?.deletedAt != null,
  }
}

/** The classifier's verdict as `review` columns, for the admin page. */
export function classifierColumns(m: ModerationResult) {
  return m.ok
    ? {
        classifierLabel: m.label,
        classifierConfidence: m.confidence,
        classifierScores: m.scores,
        classifierError: null,
      }
    : {
        classifierLabel: null,
        classifierConfidence: null,
        classifierScores: null,
        classifierError: m.error,
      }
}
