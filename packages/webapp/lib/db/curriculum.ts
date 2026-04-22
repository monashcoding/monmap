/**
 * Walk a course or AoS `curriculumStructure` JSONB and return the
 * structured set of requirement groups: for each grouping, the full
 * list of unit options the handbook lists, plus how many of them
 * students actually have to complete.
 *
 * No hardcoded titles or unit codes — everything is derived from
 * credit-point math:
 *
 *   1. **Sub-container choice** ("which Part D track?"): a sub
 *      container counts as mandatory only if removing it would put
 *      the parent under its credit-point budget. Choice groups
 *      (e.g. C2001 Part D's 5 specialisation tracks) are skipped.
 *
 *   2. **Leaf-level choice** ("FIT1049 OR FIT1055"): for each leaf
 *      group, `required = ceil(container_cp / first_leaf_cp)` so
 *      "container=6, two leaves at 6cp each" reads as 1-of-2.
 *      Options are returned sorted by `order` so the first ones are
 *      the handbook's defaults.
 *
 * Sub-containers with cp = 0 are reference / option lists; they
 * don't draw from the parent budget and are skipped.
 */
export interface RequirementGroup {
  /** Container title (nearest non-empty title in the path). */
  grouping: string
  /** How many of `options` students must complete. 1 ≤ required ≤ options.length. */
  required: number
  /** All unit codes listed under this grouping, in handbook order. */
  options: string[]
}

export function extractRequirementGroups(
  structure: unknown
): RequirementGroup[] {
  const groups: RequirementGroup[] = []
  // De-dup groupings by title — same title at multiple paths collapses.
  const indexByGrouping = new Map<string, number>()

  const addGroup = (grouping: string, options: string[], required: number) => {
    if (options.length === 0) return
    const existing = indexByGrouping.get(grouping)
    if (existing !== undefined) {
      // Merge: union options preserving order, take max required.
      const cur = groups[existing]!
      const seen = new Set(cur.options)
      for (const c of options)
        if (!seen.has(c)) {
          cur.options.push(c)
          seen.add(c)
        }
      cur.required = Math.min(
        cur.options.length,
        Math.max(cur.required, required)
      )
      return
    }
    indexByGrouping.set(grouping, groups.length)
    groups.push({
      grouping,
      required: Math.min(options.length, Math.max(1, required)),
      options: [...options],
    })
  }

  const walk = (
    node: unknown,
    ancestor: string | null,
    depth: number
  ): void => {
    if (Array.isArray(node)) {
      for (const x of node) walk(x, ancestor, depth)
      return
    }
    if (!node || typeof node !== "object") return
    const n = node as Record<string, unknown>

    const title =
      typeof n["title"] === "string"
        ? n["title"]
        : typeof n["name"] === "string"
          ? (n["name"] as string)
          : null
    const childAncestor = title || ancestor

    // --- Direct subject leaves: emit as one requirement group
    const rels = n["relationship"]
    if (Array.isArray(rels) && rels.length > 0) {
      const subjects = rels
        .filter((r): r is Record<string, unknown> => isSubjectLeaf(r))
        .sort(byOrder)
      if (subjects.length > 0) {
        const grouping = childAncestor || "Course requirements"
        const containerCp = numeric(n["credit_points"])
        const leafTotalCp = subjects.reduce(
          (s, r) => s + numeric(r["academic_item_credit_points"]),
          0
        )
        const codes = subjects.map((leaf) =>
          String(leaf["academic_item_code"]).toUpperCase()
        )
        let required: number
        if (containerCp <= 0 || containerCp >= leafTotalCp) {
          required = subjects.length
        } else {
          // Walk subjects in order, count how many are needed to satisfy budget.
          let acc = 0
          let n = 0
          for (const leaf of subjects) {
            n++
            acc += numeric(leaf["academic_item_credit_points"])
            if (acc >= containerCp) break
          }
          required = Math.max(1, n)
        }
        addGroup(grouping, codes, required)
      }
    }

    // --- Sub-containers: only descend into mandatory ones
    const subs = n["container"]
    if (!Array.isArray(subs) || subs.length === 0) return

    if (depth === 0) {
      for (const sub of subs) walk(sub, childAncestor, depth + 1)
      return
    }

    const containerCp = numeric(n["credit_points"])
    if (containerCp <= 0) {
      for (const sub of subs) walk(sub, childAncestor, depth + 1)
      return
    }

    const contributing = subs.filter(
      (s): s is Record<string, unknown> =>
        !!s &&
        typeof s === "object" &&
        numeric((s as Record<string, unknown>)["credit_points"]) > 0
    )
    const totalContrib = contributing.reduce(
      (s, x) => s + numeric(x["credit_points"]),
      0
    )

    for (const sub of subs) {
      if (!sub || typeof sub !== "object") continue
      const subRec = sub as Record<string, unknown>
      const subCp = numeric(subRec["credit_points"])
      if (subCp <= 0) continue
      const sumOthers = totalContrib - subCp
      if (sumOthers < containerCp) {
        walk(sub, childAncestor, depth + 1)
      }
    }
  }

  walk(structure, null, 0)
  return groups
}

/**
 * Flatten requirement groups into the "default load" list — the first
 * `required` options of each group. Used for templates ("Load all" /
 * prewarm) where we want a single list of unit codes to place on the
 * plan, picking the handbook's first option for any choice groups.
 */
export function pickDefaultUnits(
  groups: readonly RequirementGroup[]
): Array<{ code: string; grouping: string }> {
  const out: Array<{ code: string; grouping: string }> = []
  const seen = new Set<string>()
  for (const g of groups) {
    for (const code of g.options.slice(0, g.required)) {
      const key = `${code}|${g.grouping}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ code, grouping: g.grouping })
    }
  }
  return out
}

/**
 * Convenience: extract the flat default-units list directly from raw
 * curriculum JSONB. Equivalent to
 * `pickDefaultUnits(extractRequirementGroups(structure))`.
 */
export function extractUnitRefs(
  structure: unknown
): Array<{ code: string; grouping: string }> {
  return pickDefaultUnits(extractRequirementGroups(structure))
}

function isSubjectLeaf(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== "object") return false
  const n = node as Record<string, unknown>
  if (typeof n["academic_item_code"] !== "string") return false
  const typeRef = n["academic_item_type"] as { value?: string } | undefined
  return typeRef?.value === "subject"
}

function numeric(v: unknown): number {
  if (typeof v === "number") return v
  if (typeof v === "string") {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function byOrder(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): number {
  return numeric(a["order"]) - numeric(b["order"])
}
