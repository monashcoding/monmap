import { slotCalendarYear, slotLabel } from "@/lib/planner/timeline"
import type { PlannerState } from "@/lib/planner/types"

/** Build a CSV with one row per placed unit. */
export function buildCsv(state: PlannerState, planName: string): string {
  const rows: string[][] = [["Plan", "Year", "Semester", "Unit Code"]]
  for (let yi = 0; yi < state.years.length; yi++) {
    const year = state.years[yi]!
    for (const slot of year.slots) {
      const sem = slotLabel(state, yi, slot)
      const calendarYear = String(slotCalendarYear(state, yi, slot.kind))
      for (const code of slot.unitCodes) {
        rows.push([planName, calendarYear, sem, code])
      }
    }
  }
  return rows
    .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
    .join("\n")
}

export function downloadBlob(
  content: string,
  filename: string,
  mime: string
): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Sluggify a plan name for filenames. */
export function planSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}
