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
 * Flatten requirement groups into the "default load" list — only groups
 * where every listed option is required (required === options.length).
 * Choice/elective groups ("pick 2 of 6") are skipped entirely so the
 * template never auto-places an arbitrary elective unit.
 */
export function pickDefaultUnits(
  groups: readonly RequirementGroup[]
): Array<{ code: string; grouping: string }> {
  const out: Array<{ code: string; grouping: string }> = []
  const seen = new Set<string>()
  for (const g of groups) {
    if (g.required < g.options.length) continue
    for (const code of g.options) {
      const key = `${code}|${g.grouping}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ code, grouping: g.grouping })
    }
  }
  return out
}

/**
 * Convenience: extract only the fully-required units directly from raw
 * curriculum JSONB. Equivalent to
 * `pickDefaultUnits(extractRequirementGroups(structure))`.
 */
export function extractUnitRefs(
  structure: unknown
): Array<{ code: string; grouping: string }> {
  return pickDefaultUnits(extractRequirementGroups(structure))
}

/**
 * Extract "choice containers" — parents whose sub-containers are
 * specialisation-style alternatives (each sub roughly the size of the
 * parent budget; sum of subs exceeds the parent). Each detected
 * specialisation comes back as one entry, with its title, parent
 * grouping, the unit codes it pins, and its credit-point budget.
 *
 * Detection rule: for a parent at depth ≥ 1 with credit_points > 0,
 * each non-zero sub-container with `cp >= parent.cp / 2` AND a total
 * subs CP exceeding parent CP signals a "pick one" choice — emit each
 * such sub as a separate `EmbeddedSpecialisation`.
 *
 * Patterns this catches:
 *  - F2010 Part C (60cp) → 5 studios at 48cp each → 5 specialisations
 *  - C2001 Part D (12cp) → 5 tracks at 12cp each → 5 specialisations
 * Patterns it correctly skips:
 *  - B2029 Part B (72cp) → 6cp pools → not specialisations
 *  - E3002 Engineering (144cp) → mandatory parts summing to 144 → not
 *    specialisations
 */
export interface EmbeddedSpecialisation {
  /** Sub-container title (e.g. "Communication design"). */
  title: string
  /** Parent container title (e.g. "Part C. Studio practices"). */
  parentTitle: string
  /** Slug suitable for synthesizing a stable AoS code. */
  slug: string
  /** Parent's slug — disambiguates same-name specs across parts. */
  parentSlug: string
  /** Credit-point budget for picking this specialisation. */
  creditPoints: number
  /** Per-grouping requirement structure inside this specialisation. */
  requirements: RequirementGroup[]
}

export function extractEmbeddedSpecialisations(
  structure: unknown
): EmbeddedSpecialisation[] {
  const out: EmbeddedSpecialisation[] = []

  const walk = (
    node: unknown,
    parentTitle: string | null,
    depth: number
  ): void => {
    if (Array.isArray(node)) {
      for (const x of node) walk(x, parentTitle, depth)
      return
    }
    if (!node || typeof node !== "object") return
    const n = node as Record<string, unknown>

    const title =
      typeof n["title"] === "string"
        ? (n["title"] as string)
        : typeof n["name"] === "string"
          ? (n["name"] as string)
          : null

    const subs = n["container"]
    if (!Array.isArray(subs) || subs.length === 0) return

    // Detection only kicks in at depth ≥ 1 — depth 0 is the root
    // wrapper that has no credit-point budget of its own.
    if (depth >= 1) {
      const parentCp = numeric(n["credit_points"])
      if (parentCp > 0) {
        const contributing = subs.filter(
          (s): s is Record<string, unknown> =>
            !!s &&
            typeof s === "object" &&
            numeric((s as Record<string, unknown>)["credit_points"]) > 0
        )
        const totalContrib = contributing.reduce(
          (acc, s) => acc + numeric(s["credit_points"]),
          0
        )
        // Choice container: each contributor is at least half the parent
        // budget and the contributors collectively exceed the budget
        // (so they can't all be required simultaneously).
        const isChoice =
          contributing.length >= 2 &&
          totalContrib > parentCp &&
          contributing.every((s) => numeric(s["credit_points"]) >= parentCp / 2)
        if (isChoice) {
          const parentSlug = slugify(title ?? parentTitle ?? "")
          for (const sub of contributing) {
            const subTitle =
              (typeof sub["title"] === "string"
                ? (sub["title"] as string)
                : null) ?? "(untitled specialisation)"
            const subCp = numeric(sub["credit_points"])
            // Build the requirements *inside* this specialisation by
            // running the standard walker over its subtree. We inject
            // a fresh `container` wrapper at depth 0 so the inner walker
            // emits all leaves of this sub.
            const reqs = extractRequirementGroups({ container: [sub] })
            out.push({
              title: subTitle,
              parentTitle: title ?? parentTitle ?? "Course requirements",
              slug: slugify(subTitle),
              parentSlug,
              creditPoints: subCp,
              requirements: reqs,
            })
          }
          // Don't descend into a choice container — the embedded
          // specialisations *replace* the parent's normal extraction.
          return
        }
      }
    }
    // Recurse into every child to find choice containers anywhere
    // in the tree (including the root level).
    for (const sub of subs) walk(sub, title ?? parentTitle, depth + 1)
  }

  walk(structure, null, 0)
  return out
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
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
