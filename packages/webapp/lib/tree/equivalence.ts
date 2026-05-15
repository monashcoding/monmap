/**
 * Detect equivalent-unit families inside a graph closure.
 *
 * "Equivalent" here means a student can take any one of the units in
 * place of another for prereq purposes. Monash's data signals
 * equivalence three different ways and we union all of them:
 *
 *   1. **Title-suffix pairs** — `FIT1045 "Introduction to programming"`
 *      and `FIT1053 "Introduction to programming (Advanced)"`. Same
 *      content, advanced stream. Detectable from titles alone.
 *
 *   2. **Identical prereq set** — `ACX2100 / ACF2100 / ACC2100` all
 *      list the same 5 prereqs. Monash uses different unit codes per
 *      campus (Berwick / Caulfield / Clayton / Malaysia) for fee and
 *      visa accounting; for curriculum purposes they're interchangeable.
 *
 *   3. **Mutual prohibition** — `A prohibits B` AND `B prohibits A`.
 *      The handbook's way of saying "pick one".
 *
 * We compute a union-find over these signals, then pick a canonical
 * representative per group (lowest code wins, deterministically). The
 * renderer can then collapse the group into one chip and reveal the
 * variants on focus.
 */

import type { PlannerUnit } from "../planner/types.ts"
import type { TreeEdge } from "./types.ts"

export interface EquivalenceGroup {
  /** Canonical (representative) code. Lowest code in the group. */
  canonical: string
  /** All codes in this equivalence class, including the canonical. */
  members: string[]
}

export interface EquivalenceMap {
  /** code -> canonical code (every member maps, including the canonical itself). */
  canonicalOf: Map<string, string>
  /** canonical -> the group. */
  groups: Map<string, EquivalenceGroup>
}

/**
 * Build equivalence groups over the given codes using:
 *   - unit metadata (for title-suffix matching),
 *   - the closure's edge set (for prereq-set & mutual-prohibition).
 *
 * The result is a flat `code -> canonical` lookup plus the group
 * roster. Equivalences only collapse codes that are *both* present in
 * the closure — we don't pull in extra siblings.
 */
export function buildEquivalence(
  codes: readonly string[],
  units: ReadonlyMap<string, PlannerUnit | null>,
  edges: readonly TreeEdge[]
): EquivalenceMap {
  const inClosure = new Set(codes)
  const uf = new UnionFind(codes)

  // 1) Title-suffix pairs.
  const titleToCode = new Map<string, string>()
  for (const code of codes) {
    const u = units.get(code)
    if (!u?.title) continue
    const key = normaliseTitle(u.title)
    const peer = titleToCode.get(key)
    if (peer) uf.union(peer, code)
    else titleToCode.set(key, code)
  }

  // 2) Identical prereq set.
  const prereqsByCode = new Map<string, string>()
  const acc = new Map<string, string[]>()
  for (const e of edges) {
    if (e.type !== "prerequisite") continue
    const list = acc.get(e.from) ?? []
    list.push(e.to)
    acc.set(e.from, list)
  }
  for (const [code, list] of acc) {
    if (list.length < 2) continue
    const sig = [...new Set(list)].sort().join(",")
    prereqsByCode.set(code, sig)
  }
  const sigToCode = new Map<string, string>()
  for (const [code, sig] of prereqsByCode) {
    const peer = sigToCode.get(sig)
    if (peer) uf.union(peer, code)
    else sigToCode.set(sig, code)
  }

  // 3) Mutual prohibition.
  const prohibitionDir = new Set<string>()
  for (const e of edges) {
    if (e.type !== "prohibition") continue
    if (!inClosure.has(e.from) || !inClosure.has(e.to)) continue
    prohibitionDir.add(`${e.from}|${e.to}`)
  }
  for (const key of prohibitionDir) {
    const [a, b] = key.split("|")
    if (prohibitionDir.has(`${b}|${a}`) && a < b) uf.union(a, b)
  }

  // Materialise groups.
  const groups = new Map<string, EquivalenceGroup>()
  for (const code of codes) {
    const root = uf.find(code)
    let g = groups.get(root)
    if (!g) {
      g = { canonical: root, members: [] }
      groups.set(root, g)
    }
    g.members.push(code)
  }
  // Re-pick canonical as lowest code per group (deterministic display).
  for (const g of groups.values()) {
    g.members.sort()
    g.canonical = g.members[0]
  }
  const canonicalOf = new Map<string, string>()
  const final = new Map<string, EquivalenceGroup>()
  for (const g of groups.values()) {
    final.set(g.canonical, g)
    for (const m of g.members) canonicalOf.set(m, g.canonical)
  }

  return { canonicalOf, groups: final }
}

/**
 * Project a graph through an equivalence map, replacing every member
 * code with its canonical. Drops the resulting self-edges and
 * duplicates.
 */
export function collapseEdges(
  edges: readonly TreeEdge[],
  canonicalOf: ReadonlyMap<string, string>
): TreeEdge[] {
  const seen = new Set<string>()
  const out: TreeEdge[] = []
  for (const e of edges) {
    const from = canonicalOf.get(e.from) ?? e.from
    const to = canonicalOf.get(e.to) ?? e.to
    if (from === to) continue
    const key = `${from}|${to}|${e.type}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ from, to, type: e.type })
  }
  return out
}

/**
 * Strip "(Advanced)" / "(Honours)" / trailing whitespace and lowercase
 * so e.g. "Introduction to programming" matches
 * "Introduction to programming (Advanced)".
 */
function normaliseTitle(title: string): string {
  return title
    .replace(/\s*\((advanced|honours)\)\s*$/i, "")
    .trim()
    .toLowerCase()
}

class UnionFind {
  private parent = new Map<string, string>()
  constructor(codes: Iterable<string>) {
    for (const c of codes) this.parent.set(c, c)
  }
  find(c: string): string {
    const p = this.parent.get(c) ?? c
    if (p === c) return c
    const root = this.find(p)
    this.parent.set(c, root)
    return root
  }
  union(a: string, b: string): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra === rb) return
    // Lower code wins — makes the canonical representative deterministic.
    if (ra < rb) this.parent.set(rb, ra)
    else this.parent.set(ra, rb)
  }
}
