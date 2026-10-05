import assert from "node:assert/strict"
import { test } from "node:test"

import type { ModerationResult } from "./classifier.ts"
import { classifierColumns, statusAfterSave } from "./moderation.ts"
import { createWriteLimiter } from "./rate-limit.ts"

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

test("the write limiter spaces writes and caps them per day", () => {
  const take = createWriteLimiter({ gapMs: 10_000, perDay: 3 })
  const day = 24 * 60 * 60 * 1000
  assert.ok(take("a", 0))
  assert.ok(!take("a", 9_999), "too soon")
  assert.ok(take("b", 9_999), "other users are separate")
  assert.ok(take("a", 10_000))
  assert.ok(take("a", 20_000))
  assert.ok(!take("a", 60_000), "fourth write in a day")
  // Refused writes do not count; a write frees its slot 24 hours later.
  assert.ok(take("a", day))
  assert.ok(!take("a", day + 5_000), "too soon")

  const capped = createWriteLimiter({ gapMs: 0, perDay: 2 })
  assert.ok(capped("a", 0))
  assert.ok(capped("a", 1))
  assert.ok(!capped("a", day - 1))
  assert.ok(capped("a", day))
  assert.ok(!capped("a", day))
})
