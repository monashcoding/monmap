import assert from "node:assert/strict"
import { test } from "node:test"

import { BODY_MAX, BODY_MIN } from "./axes.ts"
import {
  cleanEntityCode,
  cleanListParams,
  parseReviewInput,
  sameReviewContent,
} from "./input.ts"

const valid = {
  kind: "unit",
  code: "FIT1045",
  overall: 4,
  ratings: { teaching: 5 },
  body: "x".repeat(BODY_MIN),
  yearTaken: "2024",
}

function message(input: unknown) {
  const r = parseReviewInput(input)
  return r.ok ? null : r.message
}

test("entity codes are trimmed, upper-cased and checked", () => {
  assert.equal(cleanEntityCode(" fit1045 "), "FIT1045")
  assert.equal(cleanEntityCode("c2001"), "C2001")
  assert.equal(cleanEntityCode("SFTWRENG-08"), "SFTWRENG-08")
  for (const bad of ["", "A", "A".repeat(17), "FIT 1045", "../x", 42, null]) {
    assert.equal(cleanEntityCode(bad), null, String(bad))
  }
})

test("a valid review comes back cleaned", () => {
  const r = parseReviewInput({
    ...valid,
    code: " fit1045 ",
    body: `  ${valid.body}  `,
    ratings: { teaching: 5, flexibility: 4, content: 0 },
  })
  assert.deepEqual(r, {
    ok: true,
    value: { ...valid, ratings: { teaching: 5 } },
  })
})

test("an unknown kind or code is rejected first", () => {
  assert.equal(message({ ...valid, kind: "user", overall: 0 }), "Unknown page.")
  assert.equal(message({ ...valid, code: "../x" }), "Unknown page.")
  assert.equal(message(null), "Unknown page.")
  assert.equal(message("FIT1045"), "Unknown page.")
})

test("overall must be a whole number from 1 to 5", () => {
  for (const overall of [0, 6, 4.5, "5", null]) {
    assert.match(message({ ...valid, overall }) ?? "", /overall rating/)
  }
  for (const overall of [1, 5]) {
    assert.equal(message({ ...valid, overall }), null)
  }
})

test("the body length is measured after trimming", () => {
  const short = ` ${"x".repeat(BODY_MIN - 1)}      `
  assert.match(message({ ...valid, body: short }) ?? "", /Write between/)
  assert.match(
    message({ ...valid, body: "x".repeat(BODY_MAX + 1) }) ?? "",
    /Write between/
  )
  assert.match(message({ ...valid, body: 42 }) ?? "", /Write between/)
  assert.equal(message({ ...valid, body: "x".repeat(BODY_MIN) }), null)
  assert.equal(message({ ...valid, body: "x".repeat(BODY_MAX) }), null)
})

test("yearTaken keeps four digits and drops anything else", () => {
  const year = (yearTaken: unknown) => {
    const r = parseReviewInput({ ...valid, yearTaken })
    return r.ok ? r.value.yearTaken : "rejected"
  }
  assert.equal(year("2024"), "2024")
  assert.equal(year("24"), null)
  assert.equal(year("2024a"), null)
  assert.equal(year(2024), null)
  assert.equal(year(undefined), null)
})

test("list params fall back to recent and clamp the offset", () => {
  assert.deepEqual(cleanListParams("highest", 20), {
    sort: "highest",
    offset: 20,
  })
  assert.equal(cleanListParams("DROP", 0).sort, "recent")
  assert.equal(cleanListParams(undefined, 0).sort, "recent")
  const offset = (v: unknown) => cleanListParams("recent", v).offset
  assert.equal(offset(-5), 0)
  assert.equal(offset(1.5), 0)
  assert.equal(offset(NaN), 0)
  assert.equal(offset("10"), 0)
  assert.equal(offset(1e9), 10_000)
})

test("same content ignores rating key order and nothing else", () => {
  const a = {
    overall: 4,
    ratings: { teaching: 5, content: 3 },
    body: "b",
    yearTaken: null,
  }
  assert.ok(
    sameReviewContent(a, { ...a, ratings: { content: 3, teaching: 5 } })
  )
  assert.ok(!sameReviewContent(a, { ...a, ratings: { teaching: 5 } }))
  assert.ok(
    !sameReviewContent(a, { ...a, ratings: { teaching: 5, content: 2 } })
  )
  assert.ok(!sameReviewContent(a, { ...a, overall: 5 }))
  assert.ok(!sameReviewContent(a, { ...a, body: "c" }))
  assert.ok(!sameReviewContent(a, { ...a, yearTaken: "2024" }))
})
