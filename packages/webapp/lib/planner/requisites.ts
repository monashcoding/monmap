import type {
  RequisiteContainer,
  RequisiteLeaf,
  RequisiteRule,
} from "./types.ts"

/**
 * Evaluate a requisite rule tree against a student's set of completed
 * unit codes.
 *
 * Shape contract:
 * - The tree is an array of top-level containers (usually length 1).
 * - A container's `parent_connector.value` tells you how *its direct
 *   children* combine. Confusing name — it reads as "how I join my
 *   parent", but in the Monash data it's the opposite.
 * - Children = union of `containers[]` and `relationships[]`.
 * - Leaves (relationships) have `academic_item_code` and no connector
 *   of their own. When a container has both sub-containers and leaves
 *   they combine under the container's own connector.
 * - An empty tree / null tree = no requirement = satisfied.
 *
 * Missing-code extraction: for an unsatisfied tree we return a flat
 * list of the codes under the branches that still fail. That's the
 * UI's cheapest hint — "add one of: FIT1008, FIT2085, FIT1054" —
 * without trying to re-render the AND/OR structure inline. Rich AND/OR rendering is the
 * detail-popover's job (which walks the same tree with full context).
 */
export interface RequisiteEvalResult {
  satisfied: boolean
  /**
   * Every unit code referenced in the tree. Stable across calls so
   * the UI can show "requires: FIT1008, MAT1830" even when satisfied.
   */
  referencedCodes: string[]
  /** Subset of referencedCodes the student hasn't completed. */
  missingCodes: string[]
  /** The unmet part, with its connectors: "FIT2115 and MAT1830". */
  missingText: string
}

export function evaluateRequisiteTree(
  rule: RequisiteRule | null | undefined,
  completed: ReadonlySet<string>
): RequisiteEvalResult {
  if (!rule || rule.length === 0) {
    return {
      satisfied: true,
      referencedCodes: [],
      missingCodes: [],
      missingText: "",
    }
  }

  const referenced = new Set<string>()
  collectReferencedCodes(rule, referenced)

  const satisfied = rule.every((container) =>
    evaluateContainer(container, completed)
  )

  const missing = new Set<string>()
  if (!satisfied) {
    for (const container of rule) {
      collectMissingCodes(container, completed, missing)
    }
  }

  return {
    satisfied,
    referencedCodes: [...referenced].sort(),
    missingCodes: [...missing].sort(),
    missingText: satisfied ? "" : describeMissing(rule, completed),
  }
}

/**
 * Codes under the branches that still fail. A satisfied branch adds
 * nothing, so `(FIT1008 OR FIT2085) AND (FIT3201 OR FIT3202)` with
 * FIT2085 done asks only for FIT3201 or FIT3202, not FIT1008 too.
 */
function collectMissingCodes(
  container: RequisiteContainer,
  completed: ReadonlySet<string>,
  out: Set<string>
): void {
  if (evaluateContainer(container, completed)) return
  for (const sub of container.containers ?? []) {
    collectMissingCodes(sub, completed, out)
  }
  for (const leaf of container.relationships ?? []) {
    if (!evaluateLeaf(leaf, completed)) out.add(leaf.academic_item_code)
  }
}

function describeMissing(
  rule: RequisiteRule,
  completed: ReadonlySet<string>
): string {
  const failing = rule.filter((c) => !evaluateContainer(c, completed))
  return joinWith(
    failing.map((c) => describeContainer(c, completed, failing.length > 1)),
    "AND"
  )
}

function describeContainer(
  container: RequisiteContainer,
  completed: ReadonlySet<string>,
  hasSiblings: boolean
): string {
  const connector = normalizeConnector(container.parent_connector?.value)
  // A failing OR lists every option.
  const subs = (container.containers ?? []).filter(
    (s) => connector === "OR" || !evaluateContainer(s, completed)
  )
  const leaves = (container.relationships ?? []).filter(
    (l) => connector === "OR" || !evaluateLeaf(l, completed)
  )
  const count = subs.length + leaves.length
  const text = joinWith(
    [
      ...subs.map((s) => describeContainer(s, completed, count > 1)),
      ...leaves.map((l) => l.academic_item_code),
    ],
    connector
  )
  return hasSiblings && count > 1 ? `(${text})` : text
}

function joinWith(parts: readonly string[], connector: "AND" | "OR"): string {
  const word = connector === "OR" ? "or" : "and"
  if (parts.length <= 2) return parts.join(` ${word} `)
  return `${parts.slice(0, -1).join(", ")} ${word} ${parts.at(-1)}`
}

function evaluateContainer(
  container: RequisiteContainer,
  completed: ReadonlySet<string>
): boolean {
  const connector = normalizeConnector(container.parent_connector?.value)
  const childResults: boolean[] = []

  for (const sub of container.containers ?? []) {
    childResults.push(evaluateContainer(sub, completed))
  }
  for (const leaf of container.relationships ?? []) {
    childResults.push(evaluateLeaf(leaf, completed))
  }

  if (childResults.length === 0) return true

  return connector === "OR"
    ? childResults.some(Boolean)
    : childResults.every(Boolean)
}

function evaluateLeaf(
  leaf: RequisiteLeaf,
  completed: ReadonlySet<string>
): boolean {
  return completed.has(leaf.academic_item_code)
}

/**
 * Every unit code a rule tree names, ignoring AND/OR structure. Used
 * to answer "which units does this rule talk about?" — for
 * prohibitions that is the whole rule, since any named unit conflicts.
 */
export function referencedCodes(
  rule: RequisiteRule | null | undefined
): Set<string> {
  const out = new Set<string>()
  if (rule?.length) collectReferencedCodes(rule, out)
  return out
}

function collectReferencedCodes(
  nodes: (RequisiteContainer | RequisiteLeaf)[],
  out: Set<string>
): void {
  for (const node of nodes) {
    if ("academic_item_code" in node) {
      out.add(node.academic_item_code)
      continue
    }
    if (node.containers?.length) collectReferencedCodes(node.containers, out)
    if (node.relationships?.length)
      collectReferencedCodes(node.relationships, out)
  }
}

/** How a container's children combine. Absent or unknown reads as AND. */
export function normalizeConnector(v: string | null | undefined): "AND" | "OR" {
  if (!v) return "AND"
  return v.toUpperCase() === "OR" ? "OR" : "AND"
}

/**
 * For a prohibition rule, satisfied means the student has taken NONE
 * of the referenced units. Prohibitions in Monash data are typically
 * flat OR-lists of "can't take both" codes.
 */
export function evaluateProhibition(
  rule: RequisiteRule | null | undefined,
  takenOrPlanned: ReadonlySet<string>
): { satisfied: boolean; conflictingCodes: string[] } {
  if (!rule || rule.length === 0) {
    return { satisfied: true, conflictingCodes: [] }
  }
  const referenced = new Set<string>()
  collectReferencedCodes(rule, referenced)
  const conflicts = [...referenced].filter((c) => takenOrPlanned.has(c)).sort()
  return { satisfied: conflicts.length === 0, conflictingCodes: conflicts }
}
