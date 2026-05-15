import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period"
import type { PlannerState } from "@/lib/planner/types"

/** All unit codes anywhere in the plan, deduplicated. */
export function allCodesFlat(state: PlannerState): string[] {
  const seen = new Set<string>()
  for (const year of state.years)
    for (const slot of year.slots)
      for (const code of slot.unitCodes) seen.add(code)
  return [...seen]
}

/** Build a CSV with one row per placed unit. */
export function buildCsv(state: PlannerState, planName: string): string {
  const startYear = Number(state.courseYear) || new Date().getFullYear()
  const rows: string[][] = [["Plan", "Year", "Semester", "Unit Code"]]
  for (let yi = 0; yi < state.years.length; yi++) {
    const year = state.years[yi]!
    for (const slot of year.slots) {
      const sem = `${PERIOD_KIND_LABEL[slot.kind]}, ${startYear + yi}`
      for (const code of slot.unitCodes) {
        rows.push([planName, String(startYear + yi), sem, code])
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
