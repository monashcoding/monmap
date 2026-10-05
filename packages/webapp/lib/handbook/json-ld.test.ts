import assert from "node:assert/strict"
import { test } from "node:test"

import { breadcrumbLd, isoDuration, jsonLdHtml, ratingLd } from "./json-ld.ts"

const review = (body: string, initials = "J.S.") => ({
  overall: 4,
  body,
  initials,
  createdAt: "2026-03-14T02:00:00.000Z",
})

test("review text can't close the script tag or open a comment", () => {
  for (const body of [
    "Great unit </script><script>alert(1)</script>",
    "Fine <!-- hidden --> and </SCRIPT >",
  ]) {
    const html = jsonLdHtml({
      ...ratingLd({ average: 4, count: 1 }, [review(body)]),
    })
    assert.ok(!html.includes("<"), html)
    const parsed = JSON.parse(html) as { review: Array<{ reviewBody: string }> }
    assert.equal(parsed.review[0].reviewBody, body)
  }
})

test("ratingLd is empty without reviews, since Google rejects a count of 0", () => {
  assert.deepEqual(ratingLd({ average: null, count: 0 }, []), {})
  assert.deepEqual(ratingLd({ average: null, count: 3 }, [review("x")]), {})
  assert.deepEqual(ratingLd({ average: 4, count: 0 }, []), {})
})

test("ratingLd rounds the average and names authors by initials only", () => {
  const ld = ratingLd({ average: 4.256, count: 2 }, [review("Good", "A.B.")])
  assert.deepEqual(ld.aggregateRating, {
    "@type": "AggregateRating",
    ratingValue: 4.26,
    ratingCount: 2,
    bestRating: 5,
    worstRating: 1,
  })
  assert.deepEqual(ld.review, [
    {
      "@type": "Review",
      reviewRating: {
        "@type": "Rating",
        ratingValue: 4,
        bestRating: 5,
        worstRating: 1,
      },
      author: { "@type": "Person", name: "A.B." },
      datePublished: "2026-03-14",
      reviewBody: "Good",
    },
  ])
})

test("breadcrumbs start at MonMap and number from 1", () => {
  const ld = breadcrumbLd([
    { name: "Search", path: "/search" },
    { name: "FIT2004", path: "/units/FIT2004" },
  ])
  const items = ld.itemListElement
  assert.deepEqual(
    items.map((it) => [it.position, it.name]),
    [
      [1, "MonMap"],
      [2, "Search"],
      [3, "FIT2004"],
    ]
  )
  // The host comes from the environment; the path is what matters.
  assert.ok(items[2].item.endsWith("/units/FIT2004"))
})

test("course durations become ISO 8601", () => {
  assert.equal(isoDuration("3 Years"), "P3Y")
  assert.equal(isoDuration("18 Months"), "P18M")
  assert.equal(isoDuration("1.5 years"), "P1.5Y")
  assert.equal(isoDuration("Varies"), undefined)
  assert.equal(isoDuration(null), undefined)
})
