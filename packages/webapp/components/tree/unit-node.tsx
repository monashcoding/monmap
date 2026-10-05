"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { CheckIcon } from "lucide-react"
import { memo } from "react"

import { RatingInline } from "@/components/reviews/stars"
import { useRating } from "@/components/reviews/use-ratings"
import { facultyStyle } from "@/lib/planner/faculty-color"
import type { TreeNode } from "@/lib/tree/types"
import { cn } from "@/lib/utils"

export type UnitNodeData = TreeNode & {
  isFocused: boolean
  isOnFocusedPath: boolean
  isDimmed: boolean
  variantCount: number
} & Record<string, unknown>

/**
 * Tree node visual — built to match the planner's unit card so a
 * student moving between Planner and Tree sees the same chips. Same
 * faculty rail, same code-then-title layout, same height envelope.
 * Differences:
 *   - Compact (76px tall vs 88px) so 30-node trees fit on screen.
 *   - Its star rating along the bottom.
 *   - A small variant chip if equivalence-collapse stacked siblings
 *     (e.g. FIT1045 + FIT1053).
 *   - Lock icon when the unit has an enrolment-rule gate beyond
 *     prereqs.
 *   - Subtle plan-status ring (green = completed in plan,
 *     primary = placed in plan); a dashed outline for a unit the
 *     course lists but the plan doesn't include.
 */
function UnitNodeInner({ data, selected }: NodeProps) {
  const d = data as unknown as UnitNodeData
  const faculty = facultyStyle(d.code)
  return (
    <div
      data-status={d.planStatus ?? "none"}
      className={cn(
        "group/tree-node relative flex h-[76px] w-[196px] min-w-0 cursor-pointer items-stretch overflow-hidden rounded-control border bg-card shadow-card transition-[transform,opacity,box-shadow,border-color] duration-150",
        "hover:-translate-y-px hover:shadow-md",
        d.isFocused || selected
          ? "border-emphasis ring-2 ring-emphasis/40"
          : d.isOnFocusedPath
            ? "border-emphasis/60"
            : "border-border",
        d.isDimmed && "opacity-40",
        d.isSeed && "ring-1 ring-primary/40",
        d.planStatus === "completed" && "ring-1 ring-success/50",
        d.planStatus === "placed" && "ring-1 ring-primary/60",
        // Listed by the course but not in the plan: a dashed outline,
        // like the requirements panel's unticked chips.
        d.planStatus === "untaken" &&
          "border-dashed bg-transparent opacity-70 shadow-none"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-none !bg-transparent"
      />
      <div
        aria-hidden
        className="relative flex w-5 shrink-0 items-center justify-center"
      >
        <div className={cn("absolute inset-0", faculty.railClass)} />
        <span
          className={cn(
            "relative rotate-180 text-[9px] font-bold tracking-widest [writing-mode:vertical-rl]",
            faculty.railTextClass
          )}
        >
          {faculty.label}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1.5 pr-2 pl-2">
        <div className="flex items-center gap-1">
          <span className="text-[12px] leading-none font-bold tabular-nums">
            {d.code}
          </span>
          {d.variantCount > 1 ? (
            <span
              title={`Equivalent to ${d.variantCount - 1} other code${d.variantCount === 2 ? "" : "s"}`}
              className="rounded-tag bg-muted px-1 py-0.5 text-[8px] leading-none font-semibold text-muted-foreground"
            >
              +{d.variantCount - 1}
            </span>
          ) : null}
          {d.hasEnrolmentGate ? (
            <span
              className="text-[11px] leading-none"
              aria-label="Has an enrolment-rule gate"
              title="Has an enrolment-rule gate"
            >
              🔒
            </span>
          ) : null}
          {d.planStatus === "completed" ? (
            <CheckIcon
              className="size-3 shrink-0 text-success"
              aria-label="In your plan"
            />
          ) : null}
          {d.periodBadge ? (
            <span className="ml-auto rounded-tag bg-muted px-1 py-0.5 text-[8px] leading-none font-semibold text-muted-foreground tabular-nums">
              {d.periodBadge}
            </span>
          ) : null}
        </div>
        <div className="line-clamp-2 text-[10px] leading-tight text-foreground/85">
          {d.unit?.title ?? (
            <span className="text-muted-foreground italic">
              Not in {d.unit?.year ?? "this year"}
            </span>
          )}
        </div>
        <NodeRating code={d.code} />
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-none !bg-transparent"
      />
    </div>
  )
}

/** Stars along the bottom of the node; blank until they load. */
function NodeRating({ code }: { code: string }) {
  const rating = useRating("unit", code)
  return (
    <div className="mt-auto h-3">
      {rating ? (
        <RatingInline summary={rating} size="xs" className="text-[10px]" />
      ) : null}
    </div>
  )
}

export const UnitNode = memo(UnitNodeInner)
