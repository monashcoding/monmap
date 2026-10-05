import assert from "node:assert/strict"
import { test } from "node:test"

import { createWriteLimiter } from "./rate-limit.ts"

const day = 24 * 60 * 60 * 1000

test("the write limiter spaces writes and caps them per day", () => {
  const take = createWriteLimiter({ gapMs: 10_000, perDay: 3 })
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

test("past the sweep size, users with no write in 24 hours are dropped", () => {
  const take = createWriteLimiter({ gapMs: 0, perDay: 5, sweepAt: 3 })
  for (const id of ["a", "b", "c"]) assert.ok(take(id, 0))
  assert.ok(take("d", day - 1))
  assert.equal(take.tracked(), 4)
  // The next write sweeps: a, b and c are idle for 24 hours, d is not.
  assert.ok(take("e", day))
  assert.equal(take.tracked(), 2)
  assert.ok(take("d", day))
})
