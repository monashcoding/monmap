import { test } from "node:test"
import assert from "node:assert/strict"

import { buildCurriculumTree, curriculumUnitCodes } from "./curriculum-tree.ts"
import {
  entityHref,
  handbookLinkToHref,
  monashHandbookUrl,
  planCourseHref,
  rewriteHandbookHtml,
} from "./links.ts"
import { parseSearchState, searchHref } from "./search-url.ts"

test("handbook links map to MonMap pages in the page's year", () => {
  assert.equal(entityHref("unit", "fit2004"), "/units/FIT2004")
  assert.equal(entityHref("aos", "DASC-MAJ", "2026"), "/aos/DASC-MAJ/2026")
  assert.equal(
    handbookLinkToHref("https://handbook.monash.edu/2021/units/FIT1008", null),
    "/units/FIT1008"
  )
  assert.equal(
    handbookLinkToHref("/2026/aos/SFTWRDEV08", "2025"),
    "/aos/SFTWRDEV08/2025"
  )
  assert.equal(
    handbookLinkToHref(
      "http://www.monash.edu/pubs/2019handbooks/units/MTH1030.html",
      null
    ),
    "/units/MTH1030"
  )
  assert.equal(handbookLinkToHref("https://www.monash.edu/it", null), null)
})

test("planner and Monash links keep the code and year", () => {
  assert.equal(planCourseHref("C2001", "2026"), "/?course=C2001&year=2026")
  assert.equal(
    planCourseHref("M6011 M6019", "2026"),
    "/?course=M6011%20M6019&year=2026"
  )
  assert.equal(
    monashHandbookUrl("course", "C2001", "2026"),
    "https://handbook.monash.edu/2026/courses/C2001"
  )
  assert.equal(entityHref("course", "C2001", "2025"), "/courses/C2001/2025")
})

test("rewriteHandbookHtml points unit links inside and other links outside", () => {
  const html = rewriteHandbookHtml(
    '<p>See <a href="https://handbook.monash.edu/2024/units/FIT1045" target="_blank">FIT1045</a> or <a href="https://www.monash.edu/it">IT</a></p>',
    null
  )
  assert.match(html, /<a href="\/units\/FIT1045">FIT1045<\/a>/)
  assert.match(
    html,
    /<a href="https:\/\/www.monash.edu\/it" target="_blank" rel="noopener noreferrer">/
  )
})

test("the curriculum tree keeps handbook order across container keys", () => {
  const nodes = buildCurriculumTree({
    container: [
      {
        title: "Part B",
        order: "2",
        credit_points: "6",
        relationship: [
          {
            academic_item_code: "FIT1049",
            academic_item_url: "/2026/units/FIT1049",
            order: "1",
          },
        ],
      },
      {
        title: "Part A",
        order: "1",
        description: "<p>You must complete</p>",
        relationship: [
          {
            academic_item_code: "FIT1045",
            academic_item_url: "/2026/units/FIT1045",
            order: "2",
          },
        ],
        container: [
          {
            title: "Majors",
            order: "1",
            relationship: [
              {
                academic_item_code: "SFTWRDEV08",
                academic_item_url: "/2026/aos/SFTWRDEV08",
              },
            ],
          },
        ],
      },
      { title: "Empty", order: "3", description: "<p>&nbsp;</p>" },
    ],
  })
  assert.deepEqual(
    nodes.map((n) => (n.kind === "group" ? n.title : n.code)),
    ["Part A", "Part B"]
  )
  const partA = nodes[0]
  assert.ok(partA.kind === "group")
  assert.deepEqual(
    partA.children.map((n) =>
      n.kind === "group" ? n.title : `${n.entity}:${n.code}`
    ),
    ["Majors", "unit:FIT1045"]
  )
  assert.deepEqual(curriculumUnitCodes(nodes).sort(), ["FIT1045", "FIT1049"])
})

test("search state drops unit filters off the Units tab and resets the page", () => {
  const years = ["2026", "2027"]
  const s = parseSearchState(
    { q: "data", level: "2", page: "3", year: "2027" },
    years
  )
  assert.equal(s.level, null)
  assert.equal(s.year, null)
  assert.equal(s.page, 3)
  const u = parseSearchState({ type: "units", level: "2", period: "S1" }, years)
  assert.equal(searchHref(u, { tab: "all" }), "/search")
  assert.equal(
    searchHref(u, { campus: "Clayton" }),
    "/search?type=units&level=2&period=S1&campus=Clayton"
  )
})
