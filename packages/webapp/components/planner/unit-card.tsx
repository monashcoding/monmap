"use client"

import { useDraggable, useDroppable } from "@dnd-kit/core"
import {
  AlertTriangleIcon,
  CircleAlertIcon,
  MoreVerticalIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { facultyStyle } from "@/lib/planner/faculty-color"
import type { PlannerCourseWithAoS } from "@/lib/planner/types"
import { keyFor } from "@/lib/planner/validation"
import { cn } from "@/lib/utils"

import { usePlanner } from "./planner-context"
import { UnitDetailPopover } from "./unit-detail-popover"

export function unitDragId(
  yearIndex: number,
  slotIndex: number,
  code: string
): string {
  return `unit:${yearIndex}:${slotIndex}:${code}`
}

/**
 * A single unit card — MonPlan-style with a faculty-coloured left
 * rail carrying the rotated prefix, code and truncated title, a
 * credit-points line, and a 3-dot menu. Validation state is
 * conveyed by a subtle outline + an inline icon (not a colour swap
 * on the rail, which would collide with faculty colour).
 */
const CARD_HEIGHT = "h-[88px]"

export function UnitCard({
  code,
  yearIndex,
  slotIndex,
  isDragOverlay = false,
}: {
  code: string
  yearIndex: number
  slotIndex: number
  isDragOverlay?: boolean
}) {
  const { units, validations, removeUnit, isFullYear, flashVersion, course } =
    usePlanner()
  const isFY = isFullYear(code)
  const unit = units.get(code)
  const validation = validations.get(keyFor(yearIndex, slotIndex, code))
  const faculty = useMemo(() => facultyStyle(code), [code])
  const isCore = useMemo(() => unitIsCore(code, course), [code, course])
  const [menuOpen, setMenuOpen] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)

  const dragId = unitDragId(yearIndex, slotIndex, code)
  const dragData = useMemo(
    () => ({
      kind: "unit" as const,
      yearIndex,
      slotIndex,
      code,
      isFullYear: isFY,
    }),
    [yearIndex, slotIndex, code, isFY]
  )
  const draggable = useDraggable({
    id: dragId,
    data: dragData,
    disabled: isDragOverlay || popoverOpen,
  })
  const droppable = useDroppable({
    id: dragId,
    data: dragData,
    disabled: isDragOverlay,
  })
  const setRefs = useCallback(
    (node: HTMLElement | null) => {
      draggable.setNodeRef(node)
      droppable.setNodeRef(node)
    },
    [draggable, droppable]
  )
  const isBeingDragged = draggable.isDragging && !isDragOverlay
  const isSwapTarget =
    droppable.isOver &&
    droppable.active?.id !== dragId &&
    droppable.active?.data.current?.kind === "unit"

  const status = useMemo((): CardStatus => {
    if (!validation) return "loading"
    if (validation.errors.length > 0) return "error"
    if (validation.warnings.length > 0) return "warn"
    return "ok"
  }, [validation])

  // Pulse the card when the user presses Validate and this card has
  // outstanding errors. We key on flashVersion (a monotonic counter)
  // so re-clicking Validate re-runs the animation even if the error
  // set is unchanged.
  const [isFlashing, setIsFlashing] = useState(false)
  const lastFlashRef = useRef(0)
  useEffect(() => {
    if (flashVersion === lastFlashRef.current) return
    lastFlashRef.current = flashVersion
    if (flashVersion === 0 || status !== "error") return
    setIsFlashing(true)
    const t = setTimeout(() => setIsFlashing(false), 1700)
    return () => clearTimeout(t)
  }, [flashVersion, status])

  return (
    <div
      ref={setRefs}
      data-validation-status={status}
      data-dragging={isBeingDragged ? "true" : undefined}
      data-swap-target={isSwapTarget ? "true" : undefined}
      className={cn(
        "group/card relative flex min-w-0 animate-in items-stretch overflow-hidden rounded-xl border bg-background shadow-card transition-[transform,box-shadow,border-color,opacity] duration-200 fade-in-0 slide-in-from-top-1",
        "hover:-translate-y-px",
        isDragOverlay
          ? "cursor-grabbing"
          : "cursor-grab active:cursor-grabbing",
        CARD_HEIGHT,
        status === "error" &&
          "border-destructive/70 ring-1 ring-destructive/25",
        status === "warn" && "border-amber-500/70 ring-1 ring-amber-500/20",
        status === "ok" && "border-border",
        status === "loading" && "border-dashed",
        isFlashing && "animate-validation-flash",
        isBeingDragged && "opacity-30",
        isSwapTarget &&
          "ring-2 ring-primary ring-offset-2 ring-offset-background",
        isDragOverlay && "rotate-1 shadow-2xl ring-2 ring-primary/40"
      )}
      {...(isDragOverlay ? {} : draggable.listeners)}
      {...(isDragOverlay ? {} : draggable.attributes)}
    >
      <div
        aria-hidden
        className="relative flex w-6 shrink-0 items-center justify-center"
      >
        <div
          className={cn(
            "absolute inset-0",
            faculty.railClass,
            !isCore && "brightness-70"
          )}
        />
        <span
          className={cn(
            "relative rotate-180 text-[10px] font-bold tracking-widest [writing-mode:vertical-rl]",
            faculty.railTextClass
          )}
        >
          {faculty.label}
        </span>
      </div>

      <UnitDetailPopover
        code={code}
        yearIndex={yearIndex}
        slotIndex={slotIndex}
        onOpenChange={setPopoverOpen}
      >
        <button
          className={cn(
            "flex min-w-0 flex-1 flex-col items-stretch gap-0.5 py-2 pr-6 pl-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
            isDragOverlay
              ? "cursor-grabbing"
              : "cursor-grab active:cursor-grabbing"
          )}
          aria-label={`Details for ${code}`}
          type="button"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold tabular-nums">{code}</span>
            <StatusIcon status={status} />
            <div className="ml-auto flex items-center gap-1">
              {isCore ? <CoreBadge /> : null}
              {isFY ? (
                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-primary uppercase">
                  Full year
                </span>
              ) : null}
            </div>
          </div>
          <div className="line-clamp-2 text-[11px] leading-snug text-foreground/90">
            {unit?.title ?? (
              <span className="text-muted-foreground italic">Loading…</span>
            )}
          </div>
          <div className="mt-auto text-[10px] font-medium text-muted-foreground tabular-nums">
            {unit ? `${unit.creditPoints} Credit Points` : ""}
          </div>
        </button>
      </UnitDetailPopover>

      {isDragOverlay ? null : (
        <UnitMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          onRemove={() => removeUnit(yearIndex, slotIndex, code)}
        />
      )}
    </div>
  )
}

function UnitMenu({
  open,
  onOpenChange,
  onRemove,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onRemove: () => void
}) {
  return (
    <div className="absolute top-0 right-0 flex items-start p-0.5">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onOpenChange(!open)}
        aria-label="Unit options"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVerticalIcon className="size-3.5" />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute top-6 right-1 z-10 flex w-max flex-col rounded-xl border bg-popover p-1 shadow-lg"
          onMouseLeave={() => onOpenChange(false)}
        >
          <button
            role="menuitem"
            onClick={() => {
              onOpenChange(false)
              onRemove()
            }}
            className="flex items-center gap-2 rounded-md px-2 py-1 text-xs whitespace-nowrap text-destructive hover:bg-destructive/10"
          >
            <XIcon className="size-3" />
            Remove unit
          </button>
        </div>
      ) : null}
    </div>
  )
}

type CardStatus = "ok" | "warn" | "error" | "loading"

function unitIsCore(
  code: string,
  course: PlannerCourseWithAoS | null
): boolean {
  if (!course) return false
  const grouping =
    course.courseUnits.find((u) => u.code === code)?.grouping ??
    course.areasOfStudy.flatMap((a) => a.units).find((u) => u.code === code)
      ?.grouping
  return grouping?.toLowerCase().includes("core") ?? false
}

function CoreBadge() {
  return (
    <span className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-primary-foreground uppercase">
      Core
    </span>
  )
}

function StatusIcon({ status }: { status: CardStatus }) {
  if (status === "error")
    return (
      <CircleAlertIcon
        className="size-3 text-destructive"
        aria-label="has errors"
      />
    )
  if (status === "warn")
    return (
      <AlertTriangleIcon
        className="size-3 text-amber-500"
        aria-label="has warnings"
      />
    )
  return null
}
