/**
 * A display tree for a course's or area of study's curriculum, read
 * from the raw CourseLoop `curriculum_structure` JSON.
 *
 * Unit requisites, AoS trees and course trees nest their containers
 * under different keys (`container`, `containers`, `relationship`,
 * `relationships`, and AoS codes as bare values elsewhere). The only
 * stable facts are that a group has a `title` and a leaf has an
 * `academic_item_code` (docs/handbook-internals.md, "Tree structures
 * inside JSONB"). So the walker reads every property and keeps the
 * objects that carry one of those two.
 */

import type { EntityKind } from "./links.ts"
import { isObj, num, type Obj } from "./raw.ts"

export interface CurriculumGroup {
  kind: "group"
  title: string
  /** Monash's prose rule for the group, as HTML. */
  description: string | null
  creditPoints: number | null
  children: CurriculumNode[]
}

export interface CurriculumItem {
  kind: "item"
  /** The page type the item links to; null for anything else. */
  entity: EntityKind | null
  code: string
  name: string | null
  creditPoints: number | null
  /** CourseLoop's item type, e.g. "subject", "major", "ug_specialisation". */
  itemType: string | null
}

export type CurriculumNode = CurriculumGroup | CurriculumItem

function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null
  if (isObj(v)) return str(v.value) ?? str(v.label)
  return null
}

function orderOf(v: unknown): number {
  const n = isObj(v) ? num(v.order) : null
  return n ?? Number.MAX_SAFE_INTEGER
}

function itemEntity(o: Obj): EntityKind | null {
  const url = typeof o.academic_item_url === "string" ? o.academic_item_url : ""
  if (/\/units\//i.test(url)) return "unit"
  if (/\/aos\//i.test(url)) return "aos"
  if (/\/courses\//i.test(url)) return "course"
  const t = str(o.academic_item_type)?.toLowerCase()
  if (t === "subject" || t === "unit") return "unit"
  if (t === "course") return "course"
  return t ? "aos" : null
}

// Prose with no text (`<p>&nbsp;</p>`) counts as no description.
function proseOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null
  const text = v
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim()
  return text ? v.trim() : null
}

interface Ranked {
  node: CurriculumNode
  order: number
}

/**
 * The nodes found below `value`. A group's children come from several
 * keys (`container` and `relationship` side by side), so each node
 * keeps its `order` and the group sorts them all together.
 */
function collect(value: unknown, depth: number): Ranked[] {
  if (depth > 40) return []
  if (Array.isArray(value)) return value.flatMap((v) => collect(v, depth + 1))
  if (!isObj(value)) return []
  const order = orderOf(value)

  if (typeof value.academic_item_code === "string") {
    const code = value.academic_item_code.trim()
    if (!code) return []
    return [
      {
        order,
        node: {
          kind: "item",
          entity: itemEntity(value),
          code: code.toUpperCase(),
          name: str(value.academic_item_name),
          creditPoints: num(value.academic_item_credit_points),
          itemType: str(value.academic_item_type),
        },
      },
    ]
  }

  const found: Ranked[] = []
  for (const [key, child] of Object.entries(value)) {
    // `parent_connector` and the CLReference fields hold no nodes.
    if (key === "parent_connector" || key === "dynamic_query") continue
    if (typeof child === "object" && child !== null) {
      found.push(...collect(child, depth + 1))
    }
  }

  if (typeof value.title === "string") {
    const description = proseOrNull(value.description)
    if (found.length === 0 && !description) return []
    return [
      {
        order,
        node: {
          kind: "group",
          title: value.title.trim(),
          description,
          creditPoints: num(value.credit_points),
          children: sortRanked(found),
        },
      },
    ]
  }
  return found
}

function sortRanked(list: Ranked[]): CurriculumNode[] {
  // A stable sort keeps the source order for equal or missing `order`.
  return [...list].sort((a, b) => a.order - b.order).map((r) => r.node)
}

export function buildCurriculumTree(raw: unknown): CurriculumNode[] {
  if (!isObj(raw)) return []
  return sortRanked(collect(raw.container ?? raw, 0))
}

/** Every item code in the tree that links to a unit page. */
export function curriculumUnitCodes(
  nodes: readonly CurriculumNode[]
): string[] {
  const out = new Set<string>()
  const walk = (list: readonly CurriculumNode[]) => {
    for (const n of list) {
      if (n.kind === "item") {
        if (n.entity === "unit") out.add(n.code)
      } else walk(n.children)
    }
  }
  walk(nodes)
  return [...out]
}
