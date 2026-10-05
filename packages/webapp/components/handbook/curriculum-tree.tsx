import { ChevronRightIcon } from "lucide-react"

import type { CurriculumNode } from "@/lib/handbook/curriculum-tree"
import type { EntityKind } from "@/lib/handbook/links"

import { EntityRows, type EntityRowData } from "./entity-lists"
import { Prose } from "./frame"
import { loadRatings, type Ratings } from "./ratings"

/** Every unit, course and area of study a structure links, for ratings. */
export function curriculumItems(
  nodes: CurriculumNode[]
): Array<{ kind: EntityKind; code: string }> {
  return nodes.flatMap((n) =>
    n.kind === "item"
      ? n.entity
        ? [{ kind: n.entity, code: n.code }]
        : []
      : curriculumItems(n.children)
  )
}

function cp(n: number | null): string | null {
  return n ? `${n} credit points` : null
}

/**
 * A course or area of study structure as the handbook lays it out:
 * each part with its credit points and rule, then its units and areas
 * of study as links. Top-level parts collapse with <details>, which
 * keeps every link in the HTML for search engines.
 */
export async function CurriculumTree({
  nodes,
  linkYear,
  linkableUnits,
  ratings: given,
}: {
  nodes: CurriculumNode[]
  linkYear: string | null
  linkableUnits: ReadonlySet<string>
  ratings?: Ratings
}) {
  const ratings = given ?? (await loadRatings(curriculumItems(nodes)))
  return (
    <div className="flex flex-col gap-3">
      {nodes.map((n, i) =>
        n.kind === "group" ? (
          <details key={i} open className="group rounded-control border">
            <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="flex items-baseline gap-2 text-sm font-semibold">
                <ChevronRightIcon
                  className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground transition-transform group-open:rotate-90"
                  aria-hidden
                />
                {n.title}
              </span>
              {cp(n.creditPoints) ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {cp(n.creditPoints)}
                </span>
              ) : null}
            </summary>
            <div className="px-4 pb-4">
              <GroupBody
                node={n}
                linkYear={linkYear}
                linkableUnits={linkableUnits}
                ratings={ratings}
              />
            </div>
          </details>
        ) : (
          <EntityRows
            key={i}
            rows={[itemRow(n, linkableUnits)]}
            linkYear={linkYear}
            ratings={ratings}
          />
        )
      )}
    </div>
  )
}

function itemRow(
  n: Extract<CurriculumNode, { kind: "item" }>,
  linkableUnits: ReadonlySet<string>
): EntityRowData {
  return {
    kind: n.entity ?? "unit",
    code: n.code,
    title: n.name,
    note: n.creditPoints ? `${n.creditPoints} cp` : null,
    showKind: true,
    linkable:
      n.entity == null
        ? false
        : n.entity === "unit"
          ? linkableUnits.has(n.code)
          : true,
  }
}

function GroupBody({
  node,
  linkYear,
  linkableUnits,
  ratings,
}: {
  node: Extract<CurriculumNode, { kind: "group" }>
  linkYear: string | null
  linkableUnits: ReadonlySet<string>
  ratings: Ratings
}) {
  // Runs of items render as one list; subgroups nest below.
  const blocks: Array<
    | { type: "items"; items: Extract<CurriculumNode, { kind: "item" }>[] }
    | { type: "group"; node: Extract<CurriculumNode, { kind: "group" }> }
  > = []
  for (const c of node.children) {
    const last = blocks.at(-1)
    if (c.kind === "item") {
      if (last?.type === "items") last.items.push(c)
      else blocks.push({ type: "items", items: [c] })
    } else blocks.push({ type: "group", node: c })
  }
  return (
    <div className="flex flex-col gap-3">
      {node.description ? (
        <Prose
          html={node.description}
          linkYear={linkYear}
          className="text-muted-foreground"
        />
      ) : null}
      {blocks.map((b, i) =>
        b.type === "items" ? (
          <EntityRows
            key={i}
            rows={b.items.map((it) => itemRow(it, linkableUnits))}
            linkYear={linkYear}
            ratings={ratings}
          />
        ) : (
          <div key={i} className="border-l-2 pl-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h4 className="text-sm font-semibold">{b.node.title}</h4>
              {cp(b.node.creditPoints) ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {cp(b.node.creditPoints)}
                </span>
              ) : null}
            </div>
            <GroupBody
              node={b.node}
              linkYear={linkYear}
              linkableUnits={linkableUnits}
              ratings={ratings}
            />
          </div>
        )
      )}
    </div>
  )
}
