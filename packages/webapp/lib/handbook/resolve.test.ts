import { test } from "node:test"
import assert from "node:assert/strict"

// resolve.ts itself imports next/navigation and the database, so the
// rules it applies live in links.ts and are tested here.
import { isCurrent, parseEntityUrl, planEntityPage } from "./links.ts"

const YEARS = ["2024", "2025", "2026", "2027"]

test("a malformed percent-encoding is a 404, not an error", () => {
  assert.deepEqual(parseEntityUrl("unit", "%E0", null), { action: "notFound" })
  assert.deepEqual(parseEntityUrl("unit", "%", null), { action: "notFound" })
})

test("a valid code goes on, decoded once more", () => {
  assert.deepEqual(parseEntityUrl("unit", "FIT1045", null), {
    action: "ok",
    code: "FIT1045",
  })
  assert.deepEqual(parseEntityUrl("unit", "FIT%31045", "2026"), {
    action: "ok",
    code: "FIT1045",
  })
})

test("a lowercase code permanently redirects and keeps the year", () => {
  assert.deepEqual(parseEntityUrl("unit", "fit1045", "2025"), {
    action: "redirect",
    permanent: true,
    to: "/units/FIT1045/2025",
  })
  assert.deepEqual(parseEntityUrl("course", "c2001", null), {
    action: "redirect",
    permanent: true,
    to: "/courses/C2001",
  })
})

test("the combined course code with a space goes on", () => {
  assert.deepEqual(parseEntityUrl("course", "M6011 M6019", null), {
    action: "ok",
    code: "M6011 M6019",
  })
})

test("junk codes and years are a 404", () => {
  for (const code of [
    "X",
    "FIT  1045",
    " FIT1045",
    "A B C",
    "<script>",
    "A".repeat(17),
    "",
  ]) {
    assert.deepEqual(parseEntityUrl("unit", code, null), { action: "notFound" })
  }
  assert.deepEqual(parseEntityUrl("unit", "FIT1045", "20x6"), {
    action: "notFound",
  })
})

test("an unknown code is a 404", () => {
  assert.deepEqual(planEntityPage("unit", "FIT9999", null, [], YEARS), {
    action: "notFound",
  })
})

test("a year without a page redirects to the bare URL", () => {
  assert.deepEqual(
    planEntityPage("unit", "FIT1045", "2019", ["2025", "2026"], YEARS),
    { action: "redirect", permanent: false, to: "/units/FIT1045" }
  )
})

test("the bare URL shows the latest year with no link year", () => {
  const r = planEntityPage("aos", "SFTWRDEV08", null, ["2026", "2027"], YEARS)
  assert.equal(r.action, "ok")
  if (r.action !== "ok") return
  assert.equal(r.entity.year, "2027")
  assert.equal(r.entity.latest, "2027")
  assert.equal(r.entity.siteLatest, "2027")
  assert.equal(r.entity.linkYear, null)
  assert.equal(r.entity.canonical, "/aos/SFTWRDEV08")
  assert.equal(r.entity.indexable, true)
})

test("a year page links in its year and is canonical to the bare URL", () => {
  const r = planEntityPage("unit", "FIT1045", "2025", ["2025", "2026"], YEARS)
  assert.equal(r.action, "ok")
  if (r.action !== "ok") return
  assert.equal(r.entity.year, "2025")
  assert.equal(r.entity.linkYear, "2025")
  assert.equal(r.entity.canonical, "/units/FIT1045")
})

test("a code gone from the two newest handbooks is not indexable", () => {
  const r = planEntityPage("unit", "ABC1234", null, ["2024", "2025"], YEARS)
  assert.equal(r.action === "ok" && r.entity.indexable, false)
  assert.equal(isCurrent("2026", "2027"), true)
  assert.equal(isCurrent("2025", "2027"), false)
  assert.equal(isCurrent("2027", "2027"), true)
})

test("with no site years the code's own latest year counts as newest", () => {
  const r = planEntityPage("unit", "FIT1045", null, ["2026"], [])
  assert.equal(r.action === "ok" && r.entity.siteLatest, "2026")
})
