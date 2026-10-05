/**
 * How a save changes a review's status. Kept apart from the database
 * code so `node --test` can check every case.
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
