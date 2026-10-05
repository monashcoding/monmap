import assert from "node:assert/strict"
import { test } from "node:test"

import type { ModerationResult } from "./classifier.ts"
import {
  classifierColumns,
  historyAfterSave,
  type PreviousReview,
  statusAfterSave,
} from "./moderation.ts"

const fair: ModerationResult = {
  ok: true,
  flagged: false,
  label: "fair review",
  confidence: 0.9,
  scores: { "fair review": 0.9 },
}
const abusive: ModerationResult = {
  ok: true,
  flagged: true,
  label: "abuse or harassment",
  confidence: 0.8,
  scores: { "fair review": 0.1, "abuse or harassment": 0.8 },
}
const failed: ModerationResult = { ok: false, error: "HTTP 429" }

test("the classifier decides new and published reviews", () => {
  assert.equal(statusAfterSave(null, false, fair), "published")
  assert.equal(statusAfterSave(null, false, abusive), "flagged")
  assert.equal(statusAfterSave("published", false, abusive), "flagged")
  // A rewritten flagged review that now passes is published again.
  assert.equal(statusAfterSave("flagged", false, fair), "published")
})

test("a classifier failure publishes new reviews but never a flagged one", () => {
  assert.equal(statusAfterSave(null, false, failed), "published")
  assert.equal(statusAfterSave("published", false, failed), "published")
  assert.equal(statusAfterSave("flagged", false, failed), "flagged")
})

test("an admin's shadowban survives any edit", () => {
  for (const m of [fair, abusive, failed]) {
    assert.equal(statusAfterSave("shadowbanned", false, m), "shadowbanned")
    // A banned author's new and existing reviews start shadowbanned.
    assert.equal(statusAfterSave(null, true, m), "shadowbanned")
    assert.equal(statusAfterSave("published", true, m), "shadowbanned")
  }
})

test("classifier columns record the verdict or the error", () => {
  assert.deepEqual(classifierColumns(abusive), {
    classifierLabel: "abuse or harassment",
    classifierConfidence: 0.8,
    classifierScores: { "fair review": 0.1, "abuse or harassment": 0.8 },
    classifierError: null,
  })
  assert.deepEqual(classifierColumns(failed), {
    classifierLabel: null,
    classifierConfidence: null,
    classifierScores: null,
    classifierError: "HTTP 429",
  })
})

const decided = new Date("2026-10-01T00:00:00Z")
const row = (
  status: PreviousReview["status"],
  deletedAt: Date | null = null
): PreviousReview => ({
  status,
  deletedAt,
  moderatedBy: "admin@monashcoding.com",
  moderatedAt: decided,
})
const cleared = { moderatedBy: null, moderatedAt: null }
const keptHistory = {
  moderatedBy: "admin@monashcoding.com",
  moderatedAt: decided,
}

test("a new review has no history", () => {
  assert.deepEqual(historyAfterSave(null, "published"), {
    ...cleared,
    resetCreatedAt: false,
  })
  assert.deepEqual(historyAfterSave(null, "shadowbanned"), {
    ...cleared,
    resetCreatedAt: false,
  })
})

test("a kept hidden status keeps its history", () => {
  assert.deepEqual(historyAfterSave(row("shadowbanned"), "shadowbanned"), {
    ...keptHistory,
    resetCreatedAt: false,
  })
  assert.deepEqual(historyAfterSave(row("flagged"), "flagged"), {
    ...keptHistory,
    resetCreatedAt: false,
  })
})

test("an edit to a published review, or a status change, clears the history", () => {
  // No admin has seen the new text.
  assert.deepEqual(historyAfterSave(row("published"), "published"), {
    ...cleared,
    resetCreatedAt: false,
  })
  assert.deepEqual(historyAfterSave(row("flagged"), "published"), {
    ...cleared,
    resetCreatedAt: false,
  })
  assert.deepEqual(historyAfterSave(row("published"), "flagged"), {
    ...cleared,
    resetCreatedAt: false,
  })
})

test("a deleted review written again is new but keeps its hidden status history", () => {
  const deleted = new Date("2026-10-02T00:00:00Z")
  assert.deepEqual(
    historyAfterSave(row("shadowbanned", deleted), "shadowbanned"),
    { ...keptHistory, resetCreatedAt: true }
  )
  assert.deepEqual(historyAfterSave(row("flagged", deleted), "published"), {
    ...cleared,
    resetCreatedAt: true,
  })
})
