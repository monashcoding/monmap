import assert from "node:assert/strict"
import { test } from "node:test"

import { isReaction, toggleReaction } from "./reactions.ts"

test("only the fixed reaction ids are reactions", () => {
  assert.ok(isReaction("up"))
  assert.ok(isReaction("wow"))
  for (const v of ["A", "👍", "regional_indicator_a", "", null, 1, "UP"]) {
    assert.ok(!isReaction(v), String(v))
  }
})

test("toggling adds, removes, and swaps up for down", () => {
  const start = { counts: { up: 2, laugh: 1 }, mine: [] }
  const added = toggleReaction(start, "laugh")
  assert.deepEqual(added, { counts: { up: 2, laugh: 2 }, mine: ["laugh"] })
  assert.deepEqual(toggleReaction(added, "laugh"), start)

  const up = toggleReaction(start, "up")
  assert.deepEqual(up, { counts: { up: 3, laugh: 1 }, mine: ["up"] })
  const down = toggleReaction(up, "down")
  assert.deepEqual(down, {
    counts: { up: 2, laugh: 1, down: 1 },
    mine: ["down"],
  })
  // A count that reaches 0 disappears.
  assert.deepEqual(toggleReaction(down, "down").counts, { up: 2, laugh: 1 })
})

test("other reactions stay when up and down swap", () => {
  const s = toggleReaction(
    toggleReaction({ counts: {}, mine: [] }, "sad"),
    "up"
  )
  assert.deepEqual(toggleReaction(s, "down").mine, ["sad", "down"])
})
