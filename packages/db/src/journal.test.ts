import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

// The Drizzle migrator applies only journal entries whose `when` is newer
// than the latest `created_at` in the ledger. An entry that sorts before
// an earlier one is skipped forever, with no error. 0008 and 0009 were
// lost this way: their hand-written `when` used 2025 instead of 2026.
// Those two are grandfathered (both are now no-ops; 0013 owns the drops).
const GRANDFATHERED = new Set([
  "0008_patch_course_requirement_groups",
  "0009_drop_better_auth_tables",
])

const journal = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../drizzle/meta/_journal.json", import.meta.url)),
    "utf8",
  ),
) as { entries: { idx: number; when: number; tag: string }[] }

test("journal: every migration's `when` is later than the one before it", () => {
  let prev = { when: 0, tag: "(start)" }
  for (const entry of journal.entries) {
    if (GRANDFATHERED.has(entry.tag)) continue
    assert.ok(
      entry.when > prev.when,
      `${entry.tag} (when ${entry.when}) is not later than ${prev.tag} (when ${prev.when}); db:migrate would skip it`,
    )
    prev = entry
  }
})

test("journal: idx matches position", () => {
  journal.entries.forEach((entry, i) => assert.equal(entry.idx, i, entry.tag))
})
