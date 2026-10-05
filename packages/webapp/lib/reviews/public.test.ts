import assert from "node:assert/strict"
import { test } from "node:test"

import {
  EDIT_GRACE_MS,
  fromSql,
  PUBLIC_COLUMNS,
  toPublic,
} from "../db/reviews.ts"

// Pins the privacy rule in docs/reviews.md: what a page, an action
// response or the ISR cache gets about a review never names its author.
// lib/db/reviews.ts connects to the database lazily, so no DB is needed.

const PUBLIC_KEYS = [
  "body",
  "createdAt",
  "edited",
  "id",
  "initials",
  "overall",
  "ratings",
  "yearTaken",
]

function row(extra: Record<string, unknown> = {}) {
  return {
    id: "r1",
    overall: 4,
    ratings: { teaching: 5 },
    body: "A fair review of the unit.",
    year_taken: "2024",
    author_initials: "AC",
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:30.000Z",
    ...extra,
  }
}

test("public reads select no author id, name or email", () => {
  assert.deepEqual(Object.keys(PUBLIC_COLUMNS).sort(), [
    "body",
    "createdAt",
    "id",
    "initials",
    "overall",
    "ratings",
    "updatedAt",
    "yearTaken",
  ])
})

test("toPublic returns exactly the public fields and drops the rest", () => {
  const r = toPublic({
    ...fromSql(row()),
    userId: "user-123",
    email: "a@b.com",
  } as Parameters<typeof toPublic>[0])
  assert.deepEqual(Object.keys(r).sort(), PUBLIC_KEYS)
  assert.ok(!JSON.stringify(r).includes("user-123"))
  assert.ok(!JSON.stringify(r).includes("a@b.com"))
  // Raw rows from the admin and own-review queries carry user-derived
  // columns too; fromSql keeps none of them.
  const raw = fromSql(row({ user_id: "user-123", author_tag: "abc123" }))
  assert.ok(!JSON.stringify(toPublic(raw)).includes("user-123"))
})

test("a review counts as edited only after the grace period", () => {
  const at = (ms: number) =>
    toPublic(
      fromSql(row({ updated_at: new Date(Date.parse(row().created_at) + ms) }))
    ).edited
  assert.equal(EDIT_GRACE_MS, 60_000)
  assert.equal(at(30_000), false)
  assert.equal(at(60_000), false)
  assert.equal(at(61_000), true)
})

test("missing ratings and year become empty values", () => {
  const r = toPublic(fromSql(row({ ratings: null, year_taken: null })))
  assert.deepEqual(r.ratings, {})
  assert.equal(r.yearTaken, null)
  assert.equal(r.createdAt, "2026-03-01T00:00:00.000Z")
})
