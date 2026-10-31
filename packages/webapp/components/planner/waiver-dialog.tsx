"use client"

import { TrashIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { placedUnitCodes } from "@/lib/planner/progress"
import { waiverNote } from "@/lib/planner/waivers"
import { cn } from "@/lib/utils"

import { usePlanner } from "./planner-context"
import { TOUCH_HIT } from "./touch-target"

/** This plan's waivers, added from a unit's prerequisites. */
export function WaiverDialog({
  open,
  onOpenChangeAction,
}: {
  open: boolean
  onOpenChangeAction: (v: boolean) => void
}) {
  const { state, dispatch, requisites } = usePlanner()
  const waivers = state.waivers ?? []
  const placed = placedUnitCodes(state)

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Prerequisite waivers</DialogTitle>
          <DialogDescription>
            A waiver counts for one unit only and adds no credit points.
          </DialogDescription>
        </DialogHeader>

        {waivers.length > 0 ? (
          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {waivers.map((waiver) => {
              const { unitCode, prerequisiteCode } = waiver
              const note = waiverNote(waiver, placed, requisites)

              return (
                <li
                  key={`${unitCode}:${prerequisiteCode}`}
                  className="flex items-center gap-2 rounded-control border bg-card px-3 py-2"
                >
                  <span className="min-w-0 flex-1 text-xs font-semibold">
                    {prerequisiteCode} waived for {unitCode}
                    {note ? (
                      <span className="block font-normal text-muted-foreground">
                        {note}
                      </span>
                    ) : null}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove waiver of ${prerequisiteCode} for ${unitCode}`}
                    className={cn("size-6 shrink-0 p-0", TOUCH_HIT)}
                    onClick={() => dispatch({ type: "remove_waiver", waiver })}
                  >
                    <TrashIcon className="size-3.5" />
                  </Button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="rounded-control border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            No waivers yet. Waive one from a placed unit&apos;s details.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
