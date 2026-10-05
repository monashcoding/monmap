import assert from "node:assert/strict"
import { test } from "node:test"

import {
  BodyTooLarge,
  capBody,
  forwardRequestHeaders,
  forwardResponseHeaders,
  ingestTarget,
} from "./ingest-proxy.ts"

const target = (path: string, search = "") =>
  ingestTarget(path, search)?.toString() ?? null

test("maps events, replay and flags to the API host and keeps the query", () => {
  assert.equal(
    target("/ingest/e/", "?ip=1"),
    "https://us.i.posthog.com/e/?ip=1"
  )
  assert.equal(target("/ingest/i/v0/e/"), "https://us.i.posthog.com/i/v0/e/")
  assert.equal(target("/ingest/i/v1/e/"), "https://us.i.posthog.com/i/v1/e/")
  assert.equal(
    target("/ingest/s/", "?compression=gzip-js"),
    "https://us.i.posthog.com/s/?compression=gzip-js"
  )
  assert.equal(
    target("/ingest/flags/", "?v=2"),
    "https://us.i.posthog.com/flags/?v=2"
  )
  assert.equal(target("/ingest/batch/"), "https://us.i.posthog.com/batch/")
  assert.equal(target("/ingest/decide"), "https://us.i.posthog.com/decide")
})

test("maps static scripts and remote config to the asset host", () => {
  assert.equal(
    target("/ingest/static/1.434.17/recorder.js"),
    "https://us-assets.i.posthog.com/static/1.434.17/recorder.js"
  )
  assert.equal(
    target("/ingest/array/phc_abc/config.js"),
    "https://us-assets.i.posthog.com/array/phc_abc/config.js"
  )
})

test("refuses paths posthog-js does not use", () => {
  assert.equal(target("/ingest/api/projects/"), null)
  assert.equal(target("/ingest"), null)
  assert.equal(target("/ingest/"), null)
  assert.equal(target("/ingest/elsewhere"), null)
  assert.equal(target("/ingest/api/surveys/", "?token=phc_abc"), null)
  assert.equal(target("/ingest/array/phc_abc/../../api/projects/"), null)
  // Dot segments cannot climb out of an allowed prefix.
  assert.equal(target("/ingest/e/../api/projects/"), null)
  assert.equal(target("/ingest/static/%2e%2e/api/projects/"), null)
  // The host cannot change.
  assert.equal(target("/ingest//evil.com/e/"), null)
  assert.equal(target("/ingest/\\evil.com/e/"), null)
  assert.equal(target("/ingest/@evil.com/e/"), null)
})

test("forwards only the allowlisted request headers, never a cookie", () => {
  const out = forwardRequestHeaders(
    new Headers({
      accept: "*/*",
      "content-type": "text/plain",
      "content-encoding": "gzip",
      "user-agent": "test",
      "x-forwarded-for": "1.2.3.4",
      cookie: "session=secret",
      authorization: "Bearer secret",
      referer: "https://monmap.monashcoding.com/?plan=1",
    })
  )
  assert.deepEqual([...out.keys()].sort(), [
    "accept",
    "content-encoding",
    "content-type",
    "user-agent",
    "x-forwarded-for",
  ])
})

test("drops set-cookie, content-encoding and content-length from the response", () => {
  const out = forwardResponseHeaders(
    new Headers({
      "content-type": "application/json",
      "cache-control": "max-age=60",
      "set-cookie": "ph=1",
      "content-encoding": "gzip",
      "content-length": "10",
    })
  )
  assert.deepEqual(Object.fromEntries(out), {
    "cache-control": "max-age=60",
    "content-type": "application/json",
    "x-content-type-options": "nosniff",
  })
})

test("serves an unsafe upstream content type as plain text", () => {
  const html = forwardResponseHeaders(
    new Headers({ "content-type": "text/html; charset=utf-8" })
  )
  assert.equal(html.get("content-type"), "text/plain; charset=utf-8")
  const js = forwardResponseHeaders(
    new Headers({ "content-type": "application/javascript; charset=utf-8" })
  )
  assert.equal(js.get("content-type"), "application/javascript; charset=utf-8")
})

async function drain(stream: ReadableStream<Uint8Array>): Promise<number> {
  let total = 0
  for await (const chunk of stream) total += chunk.byteLength
  return total
}

test("capBody passes a body up to the cap and errors past it", async () => {
  const body = (n: number) => new Response(new Uint8Array(n)).body!
  assert.equal(await drain(body(1000).pipeThrough(capBody(1000))), 1000)
  await assert.rejects(
    drain(body(1001).pipeThrough(capBody(1000))),
    BodyTooLarge
  )
})
