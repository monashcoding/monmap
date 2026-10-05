import assert from "node:assert/strict"
import { test } from "node:test"

import {
  firstParam,
  parseSearchState,
  searchHref,
  searchParamsOf,
  type SearchState,
} from "./search-url.ts"

const YEARS = ["2026", "2027"]
const parse = (sp: Record<string, string | string[] | undefined>) =>
  parseSearchState(sp, YEARS)

test("unknown tab, study and period values are ignored", () => {
  const s = parse({ type: "people", study: "Kindergarten" })
  assert.equal(s.tab, "all")
  assert.equal(s.study, null)
  assert.equal(parse({ type: "units", period: "S9" }).period, null)
  assert.equal(parse({ type: "units", level: "12" }).level, null)
})

test("page numbers below 2 or not whole give page 1, and cap at 500", () => {
  for (const page of ["0", "-2", "abc", "1.5", ""]) {
    assert.equal(parse({ page }).page, 1, page)
  }
  assert.equal(parse({ page: "7" }).page, 7)
  assert.equal(parse({ page: "9999" }).page, 500)
  assert.equal(parse({ page: "1e3" }).page, 500)
})

test("text params are trimmed and cut to 100 characters", () => {
  assert.equal(parse({ q: "  data  " }).q, "data")
  assert.equal(parse({ q: "x".repeat(300) }).q.length, 100)
  assert.equal(parse({ faculty: "f".repeat(5000) }).faculty?.length, 100)
  assert.equal(
    parse({ type: "units", campus: "c".repeat(5000) }).campus?.length,
    100
  )
  assert.equal(parse({ faculty: "   " }).faculty, null)
})

test("the first of a repeated param wins", () => {
  assert.equal(parse({ q: ["a", "b"] }).q, "a")
  assert.equal(firstParam([" x ", "y"]), "x")
  assert.equal(firstParam([]), null)
  assert.equal(firstParam(undefined), null)
})

test("the latest year and unknown years are left out of the state", () => {
  assert.equal(parse({ year: "2027" }).year, null)
  assert.equal(parse({ year: "1999" }).year, null)
  assert.equal(parse({ year: "2026" }).year, "2026")
})

test("a full state survives a trip through the URL", () => {
  const s: SearchState = {
    q: "data science",
    tab: "units",
    year: "2026",
    faculty: "Faculty of Information Technology",
    study: "Undergraduate",
    level: "2",
    period: "S1",
    campus: "Clayton",
    page: 3,
  }
  const sp = Object.fromEntries(searchParamsOf(s))
  assert.deepEqual(parse(sp), s)
  assert.equal(searchHref(s, {}).includes("page="), false)
  assert.equal(searchHref(s, { page: 4 }).endsWith("page=4"), true)
})
