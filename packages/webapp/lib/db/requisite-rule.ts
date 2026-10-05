import type {
  RequisiteContainer,
  RequisiteLeaf,
  RequisiteRule,
} from "../planner/types.ts"

/**
 * The part of a stored CourseLoop requisite rule that MonMap reads: the
 * AND/OR connector, nested containers and each leaf's code and name.
 * The stored JSON also carries `cl_id`, `parent_record`,
 * `academic_item{...}`, version names and old-year URLs on every leaf,
 * about 80% of its bytes, and none of it is read anywhere. The rule
 * ships to the browser with every planner, search and graph payload,
 * so the slimming runs before the rows are memoised.
 *
 * Pure, so it is tested without a database
 * (lib/planner/payload-shape.test.ts).
 */
export function slimRequisiteRule(rule: unknown): RequisiteRule | null {
  if (!Array.isArray(rule)) return null
  return rule.flatMap((c) => slimContainer(c) ?? [])
}

function slimContainer(raw: unknown): RequisiteContainer | null {
  if (!raw || typeof raw !== "object") return null
  const c = raw as Record<string, unknown>
  const out: RequisiteContainer = {}
  const connector = (c.parent_connector as { value?: unknown } | null)?.value
  if (typeof connector === "string") out.parent_connector = { value: connector }
  if (Array.isArray(c.containers)) {
    const containers = c.containers.flatMap((x) => slimContainer(x) ?? [])
    if (containers.length > 0) out.containers = containers
  }
  if (Array.isArray(c.relationships)) {
    const leaves = c.relationships.flatMap((x) => slimLeaf(x) ?? [])
    if (leaves.length > 0) out.relationships = leaves
  }
  return out
}

// A leaf without a code (three in the whole corpus) keeps an empty
// code, so it still blocks an AND exactly as the raw leaf did.
function slimLeaf(raw: unknown): RequisiteLeaf | null {
  if (!raw || typeof raw !== "object") return null
  const l = raw as Record<string, unknown>
  const code =
    typeof l.academic_item_code === "string" ? l.academic_item_code : ""
  return typeof l.academic_item_name === "string"
    ? { academic_item_code: code, academic_item_name: l.academic_item_name }
    : { academic_item_code: code }
}
