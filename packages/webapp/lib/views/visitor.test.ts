import assert from "node:assert/strict"
import { test } from "node:test"

import { clientIp, isBot, viewDay, visitorKey } from "./visitor.ts"

const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"

test("the view day is Melbourne's date", () => {
  // 14:30 UTC on 12 Oct is 01:30 on 13 Oct in Melbourne (AEDT).
  assert.equal(viewDay(new Date("2026-10-12T14:30:00Z")), "2026-10-13")
  assert.equal(viewDay(new Date("2026-10-12T05:00:00Z")), "2026-10-12")
})

test("the visitor key changes with the day and holds no IP address", () => {
  const a = visitorKey("2026-10-12", "1.2.3.4", CHROME, "s")
  assert.equal(a, visitorKey("2026-10-12", "1.2.3.4", CHROME, "s"))
  assert.notEqual(a, visitorKey("2026-10-13", "1.2.3.4", CHROME, "s"))
  assert.notEqual(a, visitorKey("2026-10-12", "1.2.3.5", CHROME, "s"))
  assert.notEqual(a, visitorKey("2026-10-12", "1.2.3.4", CHROME, "t"))
  assert.match(a, /^[0-9a-f]{32}$/)
  assert.ok(!a.includes("1.2.3.4"))
})

test("the client IP comes from Cloudflare, else our proxy's entry", () => {
  assert.equal(
    clientIp(
      new Headers({
        "cf-connecting-ip": "9.9.9.9",
        "x-forwarded-for": "1.1.1.1",
      })
    ),
    "9.9.9.9"
  )
  // A client can put anything on the left of x-forwarded-for.
  assert.equal(
    clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 2.2.2.2" })),
    "2.2.2.2"
  )
  assert.equal(clientIp(new Headers()), null)
})

test("crawlers and scripts are bots; browsers are not", () => {
  assert.ok(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)"))
  assert.ok(isBot("curl/8.4.0"))
  assert.ok(isBot("python-requests/2.31"))
  assert.ok(isBot(""))
  assert.ok(!isBot(CHROME))
})
