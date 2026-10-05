import { toast } from "sonner"

import type { PlaceBlock } from "@/lib/planner/capacity"

/**
 * Why a unit can't go where the student put it, as a toast. Shared by
 * drag and drop and the unit search dialog. Nothing for a missing slot.
 */
export function toastBlocked(
  reason: PlaceBlock,
  code: string,
  fullYear: boolean
) {
  switch (reason) {
    case "no_twin":
      toast.info(
        "Year-long units need both S1 and S2 - that year is missing one."
      )
      return
    case "full":
      toast.warning(
        fullYear
          ? "Not enough room - S1 and S2 both need an open slot for a year-long unit."
          : "That slot is full."
      )
      return
    case "locked":
      toast.info("That semester is locked. Unlock it to change its units.")
      return
    case "leave":
      toast.info("That semester is a leave of absence, so it takes no units.")
      return
    case "exchange":
      toast.info("That semester is on exchange, so it takes no units.")
      return
    case "duplicate":
      toast.info(
        fullYear
          ? `${code} is already in that year.`
          : `${code} is already in that semester.`
      )
      return
  }
}
