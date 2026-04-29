"use client"

import { ChevronRightIcon, DownloadIcon, LayersIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import type { PlannerAreaOfStudy } from "@/lib/planner/types"
import { cn } from "@/lib/utils"

import { usePlanner } from "./planner-context"

const KIND_LABEL: Record<PlannerAreaOfStudy["kind"], string> = {
  major: "Major",
  extended_major: "Extended major",
  minor: "Minor",
  specialisation: "Specialisation",
  elective: "Elective stream",
  other: "Other",
}

const KIND_BADGE: Record<PlannerAreaOfStudy["kind"], string> = {
  major: "bg-primary/15 text-primary",
  extended_major: "bg-primary/15 text-primary",
  specialisation: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  minor: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  elective: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  other: "bg-muted text-muted-foreground",
}

/**
 * Template loader for all AoS attached to the current course. Each AoS
 * card lets the student auto-populate units either as a whole or one
 * grouping at a time (e.g. "Core units" vs "Level 3 elective"). The
 * distribution algorithm slots units into S1/S2 by handbook level.
 */
export function AoSTemplates() {
  const { course, state } = usePlanner()

  // Only show the AoS templates for the picks the student has actually
  // made — keeps the panel compact instead of dumping every major /
  // minor / specialisation the course offers.
  const selectedCodes = useMemo(
    () =>
      new Set(Object.values(state.selectedAos).filter((c): c is string => !!c)),
    [state.selectedAos]
  )
  const selectedAos = useMemo(
    () =>
      course
        ? course.areasOfStudy.filter((a) => selectedCodes.has(a.code))
        : [],
    [course, selectedCodes]
  )

  if (!course || (selectedAos.length === 0 && course.courseUnits.length === 0))
    return null

  return (
    <section className="rounded-3xl border bg-card p-3 shadow-card">
      <div className="flex items-center gap-2 px-1">
        <LayersIcon className="size-4 text-muted-foreground" />
        <label className="text-[10px] tracking-wide text-muted-foreground uppercase">
          Templates
        </label>
      </div>
      <p className="mt-1 px-1 text-[11px] leading-snug text-muted-foreground">
        Auto-fill the planner with the degree's core units or your chosen
        specialisations.
      </p>
      <div className="mt-2 flex flex-col gap-1.5">
        {course.courseUnits.length > 0 ? (
          <CourseUnitsCard courseUnits={course.courseUnits} />
        ) : null}
        {selectedAos.map((aos) => (
          <AoSCard key={aos.code} aos={aos} />
        ))}
      </div>
    </section>
  )
}

function CourseUnitsCard({
  courseUnits,
}: {
  courseUnits: { code: string; grouping: string }[]
}) {
  const { loadUnitsTemplate } = usePlanner()
  const [open, setOpen] = useState(false)

  const groupings = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const u of courseUnits) {
      const set = m.get(u.grouping) ?? new Set<string>()
      set.add(u.code)
      m.set(u.grouping, set)
    }
    return [...m.entries()]
      .map(([name, set]) => ({ name, codes: [...set] }))
      .sort((a, b) => {
        const aCore = /core/i.test(a.name) ? 0 : 1
        const bCore = /core/i.test(b.name) ? 0 : 1
        if (aCore !== bCore) return aCore - bCore
        return a.name.localeCompare(b.name)
      })
  }, [courseUnits])

  const allCodes = useMemo(
    () => [...new Set(courseUnits.map((u) => u.code))],
    [courseUnits]
  )

  return (
    <div className="rounded-xl border-2 border-primary/30 bg-primary/[0.03]">
      <div className="flex items-start gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Collapse groupings" : "Expand groupings"}
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRightIcon
            className={cn("size-3.5 transition-transform", open && "rotate-90")}
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-primary uppercase">
              Degree
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs leading-snug font-medium">
            Course requirements
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {allCodes.length} unit{allCodes.length === 1 ? "" : "s"}
            {groupings.length > 1 ? ` · ${groupings.length} groupings` : null}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 gap-1 px-2 text-[11px]"
          onClick={() =>
            loadUnitsTemplate(allCodes, { label: "Course requirements" })
          }
        >
          <DownloadIcon className="size-3" />
          Load all
        </Button>
      </div>
      {open ? (
        <div className="flex flex-col gap-1 border-t border-primary/20 px-2.5 py-2">
          {groupings.map((g) => (
            <div
              key={g.name}
              className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5"
            >
              <div className="min-w-0">
                <div className="truncate text-[11px]">{g.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {g.codes.length} unit{g.codes.length === 1 ? "" : "s"}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 shrink-0 px-2 text-[10px]"
                onClick={() => loadUnitsTemplate(g.codes, { label: g.name })}
              >
                Load
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function AoSCard({ aos }: { aos: PlannerAreaOfStudy }) {
  const { loadUnitsTemplate } = usePlanner()
  const [open, setOpen] = useState(false)

  const groupings = useMemo(
    () => groupByGrouping(aos.requiredUnits),
    [aos.requiredUnits]
  )
  const allCodes = useMemo(
    () => [...new Set(aos.requiredUnits.map((u) => u.code))],
    [aos.requiredUnits]
  )

  return (
    <div className="rounded-xl border bg-background">
      <div className="flex items-start gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Collapse groupings" : "Expand groupings"}
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRightIcon
            className={cn("size-3.5 transition-transform", open && "rotate-90")}
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase",
                KIND_BADGE[aos.kind]
              )}
            >
              {KIND_LABEL[aos.kind]}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {aos.code}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs leading-snug font-medium">
            {aos.title}
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {allCodes.length} unit{allCodes.length === 1 ? "" : "s"}
            {groupings.length > 1 ? ` · ${groupings.length} groupings` : null}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 gap-1 px-2 text-[11px]"
          onClick={() => loadUnitsTemplate(allCodes, { label: aos.title })}
        >
          <DownloadIcon className="size-3" />
          Load all
        </Button>
      </div>
      {open ? (
        <div className="flex flex-col gap-1 border-t px-2.5 py-2">
          {groupings.map((g) => (
            <div
              key={g.name}
              className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5"
            >
              <div className="min-w-0">
                <div className="truncate text-[11px]">{g.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {g.codes.length} unit{g.codes.length === 1 ? "" : "s"}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 shrink-0 px-2 text-[10px]"
                onClick={() =>
                  loadUnitsTemplate(g.codes, {
                    label: `${aos.title} · ${g.name}`,
                  })
                }
              >
                Load
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

interface Grouping {
  name: string
  codes: string[]
}

function groupByGrouping(
  units: { code: string; grouping: string }[]
): Grouping[] {
  const map = new Map<string, Set<string>>()
  for (const u of units) {
    const set = map.get(u.grouping) ?? new Set<string>()
    set.add(u.code)
    map.set(u.grouping, set)
  }
  return [...map.entries()]
    .map(([name, set]) => ({ name, codes: [...set] }))
    .sort((a, b) => {
      // Surface "Core" groupings first; then alphabetical.
      const aCore = /core/i.test(a.name) ? 0 : 1
      const bCore = /core/i.test(b.name) ? 0 : 1
      if (aCore !== bCore) return aCore - bCore
      return a.name.localeCompare(b.name)
    })
}
