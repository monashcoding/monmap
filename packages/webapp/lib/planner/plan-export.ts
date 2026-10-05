import { slotCreditPoints } from "./capacity.ts"
import { markToGrade } from "./grades.ts"
import { summarizePlan } from "./progress.ts"
import { slotBlockCredit, slotLabel } from "./timeline.ts"
import type { PlannerOffering, PlannerState, PlannerUnit } from "./types.ts"

export interface CsvContext {
  units: ReadonlyMap<string, Pick<PlannerUnit, "title" | "creditPoints">>
  /** Lets a full-year unit show half its credit points in each semester. */
  offerings?: ReadonlyMap<string, PlannerOffering[]>
  grades: ReadonlyMap<string, number>
}

/**
 * The plan as a spreadsheet laid out like the planner: one row per
 * semester with its units across the columns and the semester's
 * credit points last. A unit cell reads
 * "FIT1045 Introduction to programming", with "(HD 85)" when it has a
 * mark. A UTF-8 byte-order mark and CRLF line endings make Excel and
 * Numbers open it cleanly.
 *
 * A row shows the semester's workload, so a retake counts in its own
 * row. The total is summarizePlan's, the same number as the progress
 * ring: each code once, and each credit entry once.
 */
export function buildCsv(state: PlannerState, ctx: CsvContext): string {
  const columns = Math.max(
    4,
    ...state.years.flatMap((y) => y.slots.map((s) => s.unitCodes.length))
  )
  const unitHeaders = Array.from({ length: columns }, (_, i) => `Unit ${i + 1}`)
  const row = (first: string, cells: string[] = [], cp = "") => [
    first,
    ...cells,
    ...Array<string>(columns - cells.length).fill(""),
    cp,
  ]

  const unitCell = (code: string) => {
    const title = ctx.units.get(code)?.title
    const mark = ctx.grades.get(code)
    return [
      code,
      title ?? "",
      mark != null ? `(${markToGrade(mark)} ${mark})` : "",
    ]
      .filter(Boolean)
      .join(" ")
  }
  const rows: string[][] = [
    ["Teaching period", ...unitHeaders, "Credit points"],
  ]
  state.years.forEach((year, yi) => {
    for (const slot of year.slots) {
      const label = slotLabel(state, yi, slot)
      if (slot.status) {
        const cp = slotBlockCredit(slot)
        rows.push(
          row(
            label,
            [slot.status === "exchange" ? "On exchange" : "On leave"],
            String(cp)
          )
        )
        continue
      }
      const cp = slotCreditPoints(slot, ctx.units, ctx.offerings)
      rows.push(row(label, slot.unitCodes.map(unitCell), String(cp)))
    }
  })

  for (const entry of state.credit ?? []) {
    rows.push(
      row(
        "Credit",
        [
          [entry.code, entry.label ?? ctx.units.get(entry.code ?? "")?.title]
            .filter(Boolean)
            .join(" ") || "Unspecified credit",
        ],
        String(entry.creditPoints)
      )
    )
  }
  const total = summarizePlan(state, null, ctx.units, ctx.offerings)
  rows.push(row("Total", [], String(total.totalCreditPoints)))

  return (
    "﻿" +
    rows
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
      .join("\r\n")
  )
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

/** The plan's name as a file name: kept readable, minus characters
 *  that Windows and macOS refuse in file names. */
export function planFileName(name: string, extension: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, "").trim() || "MonMap plan"
  return `${safe}.${extension}`
}
