import assert from "node:assert/strict"
import { afterEach, test } from "node:test"

import { FLAG_THRESHOLD, moderateReview } from "./classifier.ts"

// Stubs the global fetch, so these tests never call classifier.dev.

const realFetch = globalThis.fetch
const env = {
  url: process.env.CLASSIFIER_URL,
  key: process.env.CLASSIFIER_API_KEY,
}

afterEach(() => {
  globalThis.fetch = realFetch
  for (const [name, value] of [
    ["CLASSIFIER_URL", env.url],
    ["CLASSIFIER_API_KEY", env.key],
  ] as const) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

/** Answer every request with `body` and `status`, and record the calls. */
function stub(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
  return calls
}

function verdict(fair: number) {
  return {
    results: [
      {
        label: fair >= 0.5 ? "fair review" : "abuse or harassment",
        confidence: 0.8,
        scores: { "fair review": fair, "abuse or harassment": 1 - fair },
      },
    ],
  }
}

test("flags when the labels other than fair review reach the threshold", async () => {
  assert.equal(FLAG_THRESHOLD, 0.7)
  stub(verdict(0.9))
  assert.deepEqual(await moderateReview("Great unit"), {
    ok: true,
    flagged: false,
    label: "fair review",
    confidence: 0.8,
    scores: { "fair review": 0.9, "abuse or harassment": 1 - 0.9 },
  })
  stub(verdict(0.3))
  assert.equal(
    ((await moderateReview("x")) as { flagged: boolean }).flagged,
    true
  )
  stub(verdict(0.31))
  assert.equal(
    ((await moderateReview("x")) as { flagged: boolean }).flagged,
    false
  )
})

test("fails open with a reason on HTTP errors and bad responses", async () => {
  stub({}, 429)
  assert.deepEqual(await moderateReview("x"), { ok: false, error: "HTTP 429" })
  stub({ results: [] })
  assert.deepEqual(await moderateReview("x"), {
    ok: false,
    error: "Unexpected response",
  })
  stub({ results: [{ label: "fair review", scores: { other: 1 } }] })
  assert.deepEqual(await moderateReview("x"), {
    ok: false,
    error: "Unexpected response",
  })
  stub({ results: [{ label: "fair review", scores: { "fair review": "1" } }] })
  assert.deepEqual(await moderateReview("x"), {
    ok: false,
    error: "Unexpected response",
  })
})

test("fails open on a timeout or a network error", async () => {
  globalThis.fetch = (async () => {
    throw new DOMException("t", "TimeoutError")
  }) as typeof fetch
  assert.deepEqual(await moderateReview("x"), { ok: false, error: "Timed out" })
  globalThis.fetch = (async () => {
    throw new Error("ECONNRESET")
  }) as typeof fetch
  assert.deepEqual(await moderateReview("x"), {
    ok: false,
    error: "Request failed",
  })
})

test("sends only the review text and opts out of data sharing", async () => {
  process.env.CLASSIFIER_URL = "https://classifier.test"
  delete process.env.CLASSIFIER_API_KEY
  const calls = stub(verdict(0.9))
  await moderateReview("The tutorials were great")
  assert.equal(calls.length, 1)
  const { url, init } = calls[0]
  assert.equal(url, "https://classifier.test/v1/classify")
  const body = JSON.parse(init.body as string)
  assert.deepEqual(Object.keys(body).sort(), [
    "input",
    "instructions",
    "labels",
    "share_data",
  ])
  assert.equal(body.input, "The tutorials were great")
  assert.equal(body.share_data, false)
  const headers = init.headers as Record<string, string>
  assert.equal(headers["x-classifier-share-data"], "false")
  assert.equal(headers.authorization, undefined)
})

test("an empty CLASSIFIER_URL falls back to classifier.dev", async () => {
  process.env.CLASSIFIER_URL = ""
  const calls = stub(verdict(0.9))
  assert.equal((await moderateReview("x")).ok, true)
  assert.equal(calls[0].url, "https://classifier.dev/v1/classify")
})

test("sends the API key only when one is set", async () => {
  process.env.CLASSIFIER_API_KEY = "classifier_agent_test"
  const calls = stub(verdict(0.9))
  await moderateReview("x")
  const headers = calls[0].init.headers as Record<string, string>
  assert.equal(headers.authorization, "Bearer classifier_agent_test")
})
