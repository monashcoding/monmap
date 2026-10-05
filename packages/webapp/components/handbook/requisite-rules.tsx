import { REQUISITE_LABEL } from "@/components/unit-detail/requisite-labels"
import type { RequisiteBlock, RequisiteContainer } from "@/lib/planner/types"
import { cn } from "@/lib/utils"

import { UnitTiles } from "./entity-lists"
import { loadRatings, type Ratings } from "./ratings"

/** Every unit the rules name, for ratings. */
export function requisiteItems(
  blocks: RequisiteBlock[]
): Array<{ kind: "unit"; code: string }> {
  const out: Array<{ kind: "unit"; code: string }> = []
  const collect = (list: RequisiteContainer[]) => {
    for (const c of list) {
      for (const l of c.relationships ?? []) {
        out.push({ kind: "unit", code: l.academic_item_code })
      }
      collect(c.containers ?? [])
    }
  }
  for (const b of blocks) collect(b.rule ?? [])
  return out
}

type RuleUnit = { code: string; title: string | null; linkable: boolean }

/**
 * A unit's requisite rules as groups a student can read at a glance:
 * "One of" and "All of" boxes of unit tiles, joined by "and" or "or".
 */
export async function RequisiteRules({
  blocks,
  titles,
  linkable,
  linkYear,
  ratings: given,
}: {
  blocks: RequisiteBlock[]
  titles: Record<string, string>
  linkable: ReadonlySet<string>
  linkYear: string | null
  ratings?: Ratings
}) {
  const unit = (code: string, name?: string): RuleUnit => ({
    code,
    title: titles[code] ?? name ?? null,
    linkable: linkable.has(code),
  })
  const ratings = given ?? (await loadRatings(requisiteItems(blocks)))
  return (
    <div className="flex flex-col gap-6">
      {blocks.map((b, i) => {
        const label = REQUISITE_LABEL[b.requisiteType] ?? {
          title: b.requisiteType,
        }
        return (
          <div key={i} className="flex flex-col gap-2">
            <div>
              <h3 className="text-sm font-semibold">{label.title}</h3>
              {label.note ? (
                <p className="text-xs text-muted-foreground">{label.note}</p>
              ) : null}
            </div>
            <RuleGroup
              containers={b.rule ?? []}
              any={false}
              unit={unit}
              linkYear={linkYear}
              ratings={ratings}
              depth={0}
            />
          </div>
        )
      })}
    </div>
  )
}

function Joiner({ any }: { any: boolean }) {
  return (
    <div className="flex items-center gap-2 py-0.5" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {any ? "or" : "and"}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

/** Sibling containers, which the handbook joins with AND at the top. */
function RuleGroup({
  containers,
  any,
  unit,
  linkYear,
  ratings,
  depth,
}: {
  containers: RequisiteContainer[]
  any: boolean
  unit: (code: string, name?: string) => RuleUnit
  linkYear: string | null
  ratings: Ratings
  depth: number
}) {
  const parts = containers.filter(
    (c) => (c.relationships?.length ?? 0) + (c.containers?.length ?? 0) > 0
  )
  return (
    <div className="flex flex-col gap-2">
      {parts.map((c, i) => (
        <div key={i} className="flex flex-col gap-2">
          {i > 0 ? <Joiner any={any} /> : null}
          <RuleBox
            container={c}
            unit={unit}
            linkYear={linkYear}
            ratings={ratings}
            depth={depth}
          />
        </div>
      ))}
    </div>
  )
}

function RuleBox({
  container,
  unit,
  linkYear,
  ratings,
  depth,
}: {
  container: RequisiteContainer
  unit: (code: string, name?: string) => RuleUnit
  linkYear: string | null
  ratings: Ratings
  depth: number
}) {
  const leaves = (container.relationships ?? []).map((l) =>
    unit(l.academic_item_code, l.academic_item_name)
  )
  const subs = container.containers ?? []
  const any =
    (container.parent_connector?.value ?? "AND").toUpperCase() === "OR"
  const count = leaves.length + subs.length
  // A group that only wraps one other group adds nothing: show the
  // inner one ("All of" around a single "One of").
  if (leaves.length === 0 && subs.length === 1) {
    return (
      <RuleBox
        container={subs[0]}
        unit={unit}
        linkYear={linkYear}
        ratings={ratings}
        depth={depth}
      />
    )
  }
  // One unit on its own needs no box.
  if (count === 1 && leaves.length === 1) {
    return <UnitTiles units={leaves} linkYear={linkYear} ratings={ratings} />
  }
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-control p-3",
        depth % 2 === 0 ? "bg-muted/50" : "border bg-card"
      )}
    >
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {any ? "One of" : "All of"}
      </span>
      {leaves.length > 0 ? (
        <UnitTiles units={leaves} linkYear={linkYear} ratings={ratings} />
      ) : null}
      {subs.length > 0 ? (
        <>
          {leaves.length > 0 ? <Joiner any={any} /> : null}
          <RuleGroup
            containers={subs}
            any={any}
            unit={unit}
            linkYear={linkYear}
            ratings={ratings}
            depth={depth + 1}
          />
        </>
      ) : null}
    </div>
  )
}
