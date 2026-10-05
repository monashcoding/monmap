import { test } from "node:test"
import assert from "node:assert/strict"

import { gatedCodes } from "./payload.ts"

test("gatedCodes keeps codes with a rule that has text", () => {
  const rules = new Map([
    [
      "FIT1045",
      [{ ruleType: "other", description: "<p>Enrolled in C2001</p>" }],
    ],
    ["FIT1008", [{ ruleType: "other", description: "   " }]],
    ["FIT2004", [{ ruleType: null, description: null }]],
    [
      "FIT3155",
      [
        { ruleType: null, description: "" },
        { ruleType: "permission", description: "Permission required" },
      ],
    ],
  ])
  assert.deepEqual(gatedCodes(rules), ["FIT1045", "FIT3155"])
})

test("gatedCodes of no rules is empty", () => {
  assert.deepEqual(gatedCodes(new Map()), [])
})
