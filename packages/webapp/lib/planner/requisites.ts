import type {
  RequisiteContainer,
  RequisiteLeaf,
  RequisiteRule,
} from "./types.ts";

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
 * list of *every* code referenced. That's the UI's cheapest hint —
 * "add one of: FIT1008, FIT2085, FIT1054" — without trying to re-
 * render the AND/OR structure inline. Rich AND/OR rendering is the
 * detail-popover's job (which walks the same tree with full context).
 */
export interface RequisiteEvalResult {
  satisfied: boolean;
  /**
   * Every unit code referenced in the tree. Stable across calls so
   * the UI can show "requires: FIT1008, MAT1830" even when satisfied.
   */
  referencedCodes: string[];
  /** Subset of referencedCodes the student hasn't completed. */
  missingCodes: string[];
}

export function evaluateRequisiteTree(
  rule: RequisiteRule | null | undefined,
  completed: ReadonlySet<string>,
): RequisiteEvalResult {
  if (!rule || rule.length === 0) {
    return { satisfied: true, referencedCodes: [], missingCodes: [] };
  }

  const referenced = new Set<string>();
  collectReferencedCodes(rule, referenced);

  const satisfied = rule.every((container) =>
    evaluateContainer(container, completed),
  );

  const missing = satisfied
    ? []
    : [...referenced].filter((c) => !completed.has(c));

  return {
    satisfied,
    referencedCodes: [...referenced].sort(),
    missingCodes: missing.sort(),
  };
}

function evaluateContainer(
  container: RequisiteContainer,
  completed: ReadonlySet<string>,
): boolean {
  const connector = normalizeConnector(container.parent_connector?.value);
  const childResults: boolean[] = [];

  for (const sub of container.containers ?? []) {
    childResults.push(evaluateContainer(sub, completed));
  }
  for (const leaf of container.relationships ?? []) {
    childResults.push(evaluateLeaf(leaf, completed));
  }

  if (childResults.length === 0) return true;

  return connector === "OR"
    ? childResults.some(Boolean)
    : childResults.every(Boolean);
}

function evaluateLeaf(
  leaf: RequisiteLeaf,
  completed: ReadonlySet<string>,
): boolean {
  return completed.has(leaf.academic_item_code);
}

function collectReferencedCodes(
  nodes: (RequisiteContainer | RequisiteLeaf)[],
  out: Set<string>,
): void {
  for (const node of nodes) {
    if ("academic_item_code" in node) {
      out.add(node.academic_item_code);
      continue;
    }
    if (node.containers?.length) collectReferencedCodes(node.containers, out);
    if (node.relationships?.length) collectReferencedCodes(node.relationships, out);
  }
}

function normalizeConnector(v: string | null | undefined): "AND" | "OR" {
  if (!v) return "AND";
  return v.toUpperCase() === "OR" ? "OR" : "AND";
}

/**
 * For a prohibition rule, satisfied means the student has taken NONE
 * of the referenced units. Prohibitions in Monash data are typically
 * flat OR-lists of "can't take both" codes.
 */
export function evaluateProhibition(
  rule: RequisiteRule | null | undefined,
  takenOrPlanned: ReadonlySet<string>,
): { satisfied: boolean; conflictingCodes: string[] } {
  if (!rule || rule.length === 0) {
    return { satisfied: true, conflictingCodes: [] };
  }
  const referenced = new Set<string>();
  collectReferencedCodes(rule, referenced);
  const conflicts = [...referenced]
    .filter((c) => takenOrPlanned.has(c))
    .sort();
  return { satisfied: conflicts.length === 0, conflictingCodes: conflicts };
}
