import assert from "node:assert/strict"
import { test } from "node:test"

import { reviewDate } from "./format.ts"

test("reviewDate shows the day, month and year in UTC", () => {
  assert.equal(reviewDate("2026-10-12T03:00:00Z"), "12 October 2026")
  // 23:30 UTC on the 31st is already the 1st in Melbourne; UTC wins.
  assert.equal(reviewDate("2026-03-31T23:30:00Z"), "31 March 2026")
})
