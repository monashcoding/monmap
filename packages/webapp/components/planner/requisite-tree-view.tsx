"use client"

import { CheckIcon, MinusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { normalizeConnector } from "@/lib/planner/requisites"
import type {
  RequisiteContainer,
  RequisiteLeaf,
  RequisiteRule,
} from "@/lib/planner/types"
import { cn } from "@/lib/utils"

import { TOUCH_HIT_ROW } from "./touch-target"

/** A prerequisite tree's waivers. */
export interface TreeWaivers {
  waived: ReadonlySet<string>
  /** Unmet codes offered a Waive button. */
  waivable: ReadonlySet<string>
  /** False shows waivers without Waive or Undo. */
  editable: boolean
  onWaiveAction: (code: string) => void
  onUnwaiveAction: (code: string) => void
}

/**
 * Render an AND/OR tree. Each level prefixes a connector label so
 * students can read the rule as prose-ish:
 *   AND
 *     ├ OR
 *     │   FIT1008   (✓)
 *     │   FIT2085
 *     ├ OR
 *     │   MAT1830   (✓)
 */
export function RequisiteTreeView({
  rule,
  completed,
  isProhibition = false,
  units,
  waivers,
}: {
  rule: RequisiteRule | null | undefined
  completed: ReadonlySet<string>
  isProhibition?: boolean
  units?: ReadonlyMap<string, { title: string }>
  waivers?: TreeWaivers
}) {
  if (!rule || rule.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No requirements listed.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1 text-xs">
      {rule.map((c, i) => (
        <ContainerNode
          key={i}
          container={c}
          depth={0}
          completed={completed}
          isProhibition={isProhibition}
          units={units}
          waivers={waivers}
        />
      ))}
    </div>
  )
}

function ContainerNode({
  container,
  depth,
  completed,
  isProhibition,
  units,
  waivers,
}: {
  container: RequisiteContainer
  depth: number
  completed: ReadonlySet<string>
  isProhibition: boolean
  units?: ReadonlyMap<string, { title: string }>
  waivers?: TreeWaivers
}) {
  const connector = normalizeConnector(container.parent_connector?.value)
  const children = [
    ...(container.containers ?? []).map((c, i) => (
      <ContainerNode
        key={`c${i}`}
        container={c}
        depth={depth + 1}
        completed={completed}
        isProhibition={isProhibition}
        units={units}
        waivers={waivers}
      />
    )),
    ...(container.relationships ?? []).map((l, i) => (
      <LeafNode
        key={`l${i}`}
        leaf={l}
        completed={completed}
        isProhibition={isProhibition}
        units={units}
        waivers={waivers}
      />
    )),
  ]
  if (children.length === 0) return null

  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        depth > 0 && "border-l border-dashed pl-3"
      )}
    >
      {children.length > 1 ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          {connector === "OR" ? "any of" : "all of"}
        </span>
      ) : null}
      {children}
    </div>
  )
}

function LeafNode({
  leaf,
  completed,
  isProhibition,
  units,
  waivers,
}: {
  leaf: RequisiteLeaf
  completed: ReadonlySet<string>
  isProhibition: boolean
  units?: ReadonlyMap<string, { title: string }>
  waivers?: TreeWaivers
}) {
  const code = leaf.academic_item_code
  const taken = completed.has(code)
  // Actually taking the unit outranks a waiver for it.
  const waived = !taken && !!waivers?.waived.has(code)
  const met = taken || waived

  // Prohibitions invert: "taken" is a problem, not a check.
  const good = isProhibition ? !taken : met

  const name =
    units?.get(leaf.academic_item_code)?.title ?? leaf.academic_item_name

  return (
    <div
      className={cn(
        "flex items-baseline gap-2 rounded-control px-2 py-1",
        good ? "text-foreground" : "text-muted-foreground",
        isProhibition && taken && "bg-destructive/10 text-destructive",
        !isProhibition && met && "bg-success-soft"
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border",
          good
            ? "border-success/50 bg-success-soft text-success"
            : "border-border"
        )}
        aria-hidden
      >
        {good ? (
          <CheckIcon className="size-2.5" />
        ) : (
          <MinusIcon className="size-2.5" />
        )}
      </span>
      <span className="text-xs font-semibold tabular-nums">
        {leaf.academic_item_code}
      </span>
      {name ? (
        <span className="truncate text-xs text-muted-foreground">{name}</span>
      ) : null}
      {waived ? (
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
          Waived
        </span>
      ) : null}
      {/* One button that swaps its label, so keyboard focus stays on it. */}
      {waivers?.editable && (waived || (!met && waivers.waivable.has(code))) ? (
        <Button
          variant="ghost"
          size="xs"
          aria-label={`${waived ? "Undo waiver of" : "Waive"} ${code}`}
          className={cn("shrink-0", !waived && "ml-auto", TOUCH_HIT_ROW)}
          onClick={() =>
            waived ? waivers.onUnwaiveAction(code) : waivers.onWaiveAction(code)
          }
        >
          {waived ? "Undo" : "Waive"}
        </Button>
      ) : null}
    </div>
  )
}
