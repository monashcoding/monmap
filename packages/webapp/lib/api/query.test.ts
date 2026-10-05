import { test } from "node:test"
import assert from "node:assert/strict"

import { cleanEntityCode } from "../reviews/input.ts"
import {
  apiUrl,
  chunkCodes,
  joinCodes,
  MAX_RATING_CODES,
  MAX_TEXT_CODES,
  MAX_URL_CODES,
  splitCodes,
} from "./query.ts"

test("apiUrl sorts keys and leaves out empty values", () => {
  assert.equal(
    apiUrl("/api/units", { year: "2026", codes: "FIT1008,FIT1045" }),
    "/api/units?codes=FIT1008%2CFIT1045&year=2026"
  )
  assert.equal(
    apiUrl("/api/tree", { year: "2026", mode: "unit", aos: null, unit: "" }),
    "/api/tree?mode=unit&year=2026"
  )
  assert.equal(apiUrl("/api/units", { year: null }), "/api/units")
})

test("the same request gives the same URL, whatever the order", () => {
  const a = apiUrl("/api/ratings", {
    kind: "unit",
    codes: joinCodes(["FIT2004", "FIT1045", "FIT2004"]),
  })
  const b = apiUrl("/api/ratings", {
    codes: joinCodes(["FIT1045", "FIT2004"]),
    kind: "unit",
  })
  assert.equal(a, b)
})

test("chunkCodes dedupes, sorts and splits a course-sized list", () => {
  const codes = Array.from({ length: 813 }, (_, i) => `ENG${1813 - i}`)
  const chunks = chunkCodes([...codes, ...codes])
  assert.deepEqual(
    chunks.map((c) => c.length),
    [MAX_URL_CODES, 813 - MAX_URL_CODES]
  )
  assert.deepEqual(chunks.flat(), [...codes].sort())
  assert.deepEqual(chunkCodes([]), [])
  assert.deepEqual(chunkCodes(["B", "A", "C"], 2), [["A", "B"], ["C"]])
})

test("splitCodes drops junk, dedupes, sorts and caps", () => {
  assert.deepEqual(
    splitCodes(`FIT2004,FIT1045,FIT2004,fit1008,x,,${"A".repeat(25)}`),
    ["FIT1045", "FIT2004"]
  )
  assert.deepEqual(splitCodes("C2,B2,A2,A1", 2), ["A1", "A2"])
  assert.deepEqual(splitCodes(null), [])
  assert.deepEqual(splitCodes(""), [])
})

test("splitCodes takes a cleaner, such as the review code check", () => {
  assert.deepEqual(
    splitCodes("fit1045,FIT1045,bad code!", 10, cleanEntityCode),
    ["FIT1045"]
  )
})

test("codes survive the trip through a URL, spaces included", () => {
  const codes = ["M6011 M6019", "FIT1045", "C2001"]
  const url = new URL(
    apiUrl("/api/units", { year: "2026", codes: joinCodes(codes) }),
    "https://example.test"
  )
  assert.deepEqual(splitCodes(url.searchParams.get("codes")), [
    "C2001",
    "FIT1045",
    "M6011 M6019",
  ])
  assert.equal(url.searchParams.get("year"), "2026")
})

test("a chunk split by a route's limit comes back whole from splitCodes", () => {
  const codes = Array.from({ length: 701 }, (_, i) => `FIT${1000 + i}`)
  for (const [max, clean] of [
    [MAX_URL_CODES, undefined],
    [MAX_RATING_CODES, cleanEntityCode],
    [MAX_TEXT_CODES, undefined],
  ] as const) {
    for (const chunk of chunkCodes(codes, max)) {
      assert.deepEqual(splitCodes(joinCodes(chunk), max, clean), chunk)
    }
  }
})
