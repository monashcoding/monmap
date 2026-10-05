import { test } from "node:test"
import assert from "node:assert/strict"

import {
  cacheHandbook,
  deepFreeze,
  MEMO_MAX_ENTRIES,
  MEMO_TTL_MS,
} from "./memo.ts"

/** A memoisable fn that counts its runs; `make` builds each result. */
function counted<R>(make: (n: number) => R) {
  let calls = 0
  // The key only matters to the memo.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const fn = async (_key: string) => make(++calls)
  return { fn, calls: () => calls }
}

test("two concurrent calls with the same args run fn once and share the value", async () => {
  const c = counted((n) => ({ n, rows: [1, 2, 3] }))
  const memo = cacheHandbook(c.fn)
  const [a, b] = await Promise.all([memo("x"), memo("x")])
  assert.equal(c.calls(), 1)
  assert.equal(a, b)
  assert.equal(await memo("x"), a)
  assert.equal(c.calls(), 1)
})

test("different args are different entries", async () => {
  const c = counted((n) => n)
  const memo = cacheHandbook(c.fn)
  assert.equal(await memo("a"), 1)
  assert.equal(await memo("b"), 2)
  assert.equal(await memo("a"), 1)
})

test("a call after the TTL re-runs fn", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 })
  const c = counted((n) => n)
  const memo = cacheHandbook(c.fn)
  assert.equal(await memo("x"), 1)
  t.mock.timers.tick(MEMO_TTL_MS - 1)
  assert.equal(await memo("x"), 1)
  t.mock.timers.tick(1)
  assert.equal(await memo("x"), 2)
})

test("a rejected call is not cached, so the next call retries", async () => {
  let calls = 0
  const memo = cacheHandbook(async () => {
    calls++
    if (calls === 1) throw new Error("db down")
    return "ok"
  })
  await assert.rejects(memo(), /db down/)
  assert.equal(await memo(), "ok")
  assert.equal(calls, 2)
})

test("a rejected call does not evict the entry that replaced it", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 })
  let calls = 0
  let fail!: (e: Error) => void
  const memo = cacheHandbook(async () => {
    calls++
    if (calls === 1)
      return new Promise<string>((_, reject) => {
        fail = reject
      })
    return "fresh"
  })
  const first = memo()
  t.mock.timers.tick(MEMO_TTL_MS)
  assert.equal(await memo(), "fresh")
  fail(new Error("late"))
  await assert.rejects(first, /late/)
  assert.equal(await memo(), "fresh")
  assert.equal(calls, 2)
})

test("the entry after the cap evicts the oldest key; a hit does not refresh it", async () => {
  const c = counted((n) => n)
  const memo = cacheHandbook(c.fn)
  for (let i = 0; i < MEMO_MAX_ENTRIES; i++) await memo(`k${i}`)
  assert.equal(c.calls(), MEMO_MAX_ENTRIES)
  // A hit on the oldest key does not move it to newest.
  await memo("k0")
  assert.equal(c.calls(), MEMO_MAX_ENTRIES)
  await memo("new")
  await memo("k1")
  assert.equal(c.calls(), MEMO_MAX_ENTRIES + 1)
  await memo("k0")
  assert.equal(c.calls(), MEMO_MAX_ENTRIES + 2)
})

test("outside production a cached value is frozen, so mutation throws", async () => {
  const memo = cacheHandbook(async () => ({
    list: [3, 1, 2],
    nested: { a: 1 },
  }))
  const v = await memo()
  assert.throws(() => v.list.sort(), TypeError)
  assert.throws(() => v.list.push(4), TypeError)
  assert.throws(() => {
    ;(v.nested as { a: number }).a = 2
  }, TypeError)
  assert.deepEqual((await memo()).list, [3, 1, 2])
})

test("deepFreeze handles shared subtrees, cycles and primitives", () => {
  const shared = { x: 1 }
  const v: Record<string, unknown> = { a: shared, b: shared, d: new Date(0) }
  v.self = v
  assert.equal(deepFreeze(v), v)
  assert.ok(Object.isFrozen(shared))
  assert.equal(deepFreeze(null), null)
  assert.equal(deepFreeze(5), 5)
})
