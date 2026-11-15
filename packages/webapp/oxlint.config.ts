import { macLintConfig } from "@monashcoding/lint"
import { defineConfig } from "oxlint"

// The MAC preset, added beside eslint (which keeps the Next rules).
// Every rule below fires in code that predates the preset, so it
// starts as a warning. Switch one back to "error" (delete its line)
// when its count reaches zero. Counts are from the day it was added.
export default defineConfig(
  macLintConfig({
    rules: {
      "anti-slop/require-readable-spacing": "warn", // 2455
      "anti-slop/require-safety-comment-for-type-assertion": "warn", // 131
      "anti-slop/no-runtime-typeof": "warn", // 59
      "anti-slop/no-unknown-parameters": "warn", // 51
      "anti-slop/no-known-value-widening": "warn", // 25
      "anti-slop/no-shape-in-symbol-names": "warn", // 24
      "anti-slop/no-unsafe-dictionary-type": "warn", // 22
      "anti-slop/no-chained-type-assertions": "warn", // 20
      "anti-slop/no-conditional-empty-object-spread": "warn", // 9
      "anti-slop/no-array-filter-map": "warn", // 8
      "anti-slop/no-object-parameters": "warn", // 2
      "oxc/no-accumulating-spread": "warn", // 1
    },
  })
)
