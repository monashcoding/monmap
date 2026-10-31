import {
  RequisiteTreeView,
  type TreeWaivers,
} from "@/components/planner/requisite-tree-view"
import type { RequisiteBlock } from "@/lib/planner/types"
import { cn } from "@/lib/utils"

import { requisiteTitle } from "./requisite-labels"

/** Blocks with a rule tree to draw; the rest have nothing to show. */
export function blocksWithRules(blocks: RequisiteBlock[]): RequisiteBlock[] {
  return blocks.filter((b) => b.rule && b.rule.length > 0)
}

/**
 * One requisite block: its heading and its AND/OR tree, with ticks
 * for the codes in `completed`. `units` names leaf codes with their
 * titles when the caller has them (the planner does). `waivers` only
 * reach a prerequisite block, the one kind a waiver applies to.
 */
export function RequisiteRuleBlock({
  block,
  completed,
  units,
  waivers,
}: {
  block: RequisiteBlock
  completed: ReadonlySet<string>
  units?: ReadonlyMap<string, { title: string }>
  waivers?: TreeWaivers
}) {
  const isProhibition = block.requisiteType === "prohibition"
  return (
    <div className="mb-3 last:mb-0">
      <h4
        className={cn(
          "mb-1.5 text-[10px] tracking-wide uppercase",
          isProhibition ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {requisiteTitle(block.requisiteType)}
      </h4>
      <RequisiteTreeView
        rule={block.rule}
        completed={completed}
        isProhibition={isProhibition}
        units={units}
        waivers={block.requisiteType === "prerequisite" ? waivers : undefined}
      />
    </div>
  )
}
