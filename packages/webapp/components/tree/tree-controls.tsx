"use client"

import { ChevronDownIcon, SearchIcon, XIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { searchUnitsAction } from "@/app/actions"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import type {
  PlannerAreaOfStudy,
  PlannerCourse,
  PlannerUnit,
} from "@/lib/planner/types"
import type { TreeControlsValue } from "@/lib/tree/payload"
import type { TreeDirection, TreeMode } from "@/lib/tree/types"
import { cn } from "@/lib/utils"

export type { TreeControlsValue } from "@/lib/tree/payload"

export interface TreeControlsProps {
  value: TreeControlsValue
  onChange: (next: TreeControlsValue) => void
  availableYears: string[]
  courses: PlannerCourse[]
  /** AoS options for the currently selected course; empty if none chosen. */
  aosOptions: PlannerAreaOfStudy[]
  /** Whether the signed-in user has a plan we can colour by. */
  canUsePlan: boolean
  /** Background data fetch in flight. Surfaced as a small inline note. */
  loading?: boolean
}

const MODES: Array<{ value: TreeMode; label: string; hint: string }> = [
  {
    value: "course",
    label: "Course / major",
    hint: "Show every unit needed to complete a degree path.",
  },
  {
    value: "unit",
    label: "Unit",
    hint: "Centre the graph on one unit's prereqs or downstream.",
  },
]

const DIRECTIONS: Array<{ value: TreeDirection; label: string }> = [
  { value: "upstream", label: "What it needs" },
  { value: "downstream", label: "What it unlocks" },
  { value: "both", label: "Both" },
]

export function TreeControls({
  value,
  onChange,
  availableYears,
  courses,
  aosOptions,
  canUsePlan,
  loading,
}: TreeControlsProps) {
  const set = <K extends keyof TreeControlsValue>(
    k: K,
    v: TreeControlsValue[K]
  ) => onChange({ ...value, [k]: v })

  return (
    <aside className="flex flex-col gap-4">
      <ModeBlock value={value.mode} onChange={(m) => set("mode", m)} />

      {value.mode === "course" ? (
        <CourseBlock
          courses={courses}
          aosOptions={aosOptions}
          courseCode={value.courseCode}
          aosCode={value.aosCode}
          year={value.year}
          depth={value.depth}
          availableYears={availableYears}
          onPickCourse={(c) =>
            onChange({ ...value, courseCode: c, aosCode: null })
          }
          onPickAos={(a) => set("aosCode", a)}
          onPickYear={(y) => set("year", y)}
          onPickDepth={(d) => set("depth", d)}
        />
      ) : (
        <UnitBlock
          unitCode={value.unitCode}
          year={value.year}
          depth={value.depth}
          direction={value.direction}
          availableYears={availableYears}
          onPickUnit={(c) => set("unitCode", c)}
          onPickDirection={(d) => set("direction", d)}
          onPickYear={(y) => set("year", y)}
          onPickDepth={(d) => set("depth", d)}
        />
      )}

      {canUsePlan ? (
        <PlanBlock
          enabled={value.useMyPlan}
          onChange={(b) => set("useMyPlan", b)}
        />
      ) : null}

      <Legend />
      {loading ? (
        <p className="animate-pulse px-2 text-[11px] text-muted-foreground">
          loading…
        </p>
      ) : null}
    </aside>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-3xl border bg-card p-3 shadow-card">
      <div className="px-1 pb-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </div>
      {children}
    </section>
  )
}

function ModeBlock({
  value,
  onChange,
}: {
  value: TreeMode
  onChange: (m: TreeMode) => void
}) {
  return (
    <Section title="View">
      <div className="grid grid-cols-2 gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => onChange(m.value)}
            type="button"
            className={cn(
              "flex flex-col items-start rounded-xl border px-2.5 py-2 text-left transition-colors",
              value === m.value
                ? "border-[var(--monash-purple)] bg-[var(--monash-purple-soft)] text-[var(--monash-purple-deep)]"
                : "border-border bg-background hover:border-muted-foreground/40"
            )}
          >
            <span className="text-xs font-semibold">{m.label}</span>
            <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
              {m.hint}
            </span>
          </button>
        ))}
      </div>
    </Section>
  )
}

function CourseBlock({
  courses,
  aosOptions,
  courseCode,
  aosCode,
  year,
  depth,
  availableYears,
  onPickCourse,
  onPickAos,
  onPickYear,
  onPickDepth,
}: {
  courses: PlannerCourse[]
  aosOptions: PlannerAreaOfStudy[]
  courseCode: string | null
  aosCode: string | null
  year: string
  depth: number
  availableYears: string[]
  onPickCourse: (code: string) => void
  onPickAos: (code: string | null) => void
  onPickYear: (y: string) => void
  onPickDepth: (d: number) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedCourse = useMemo(
    () => courses.find((c) => c.code === courseCode) ?? null,
    [courses, courseCode]
  )
  return (
    <Section title="Course & major">
      <div className="flex flex-col gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl border bg-background px-3 py-2 text-left hover:border-muted-foreground/40"
              >
                <span className="min-w-0 truncate text-xs">
                  {selectedCourse ? (
                    <>
                      <span className="font-bold tabular-nums">
                        {selectedCourse.code}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {selectedCourse.title}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      Pick a course…
                    </span>
                  )}
                </span>
                <ChevronDownIcon className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
              </button>
            }
          />
          <PopoverContent className="w-[360px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search courses…" />
              <CommandList>
                <CommandEmpty>No matches.</CommandEmpty>
                <CommandGroup>
                  {courses.map((c) => (
                    <CommandItem
                      key={c.code}
                      value={`${c.code} ${c.title}`}
                      onSelect={() => {
                        onPickCourse(c.code)
                        setOpen(false)
                      }}
                    >
                      <span className="text-[11px] font-bold tabular-nums">
                        {c.code}
                      </span>
                      <span className="ml-2 truncate text-[11px]">
                        {c.title}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Select
          value={aosCode ?? "__all__"}
          onValueChange={(v) => {
            const s = String(v)
            onPickAos(s === "__all__" ? null : s)
          }}
        >
          <SelectTrigger className="w-full" disabled={!courseCode}>
            <SelectValue
              placeholder={courseCode ? "All majors" : "Pick a course first"}
            >
              {(value: unknown) => {
                if (value === "__all__" || value == null)
                  return "All majors (course core)"
                const aos = aosOptions.find((a) => a.code === value)
                return aos ? aos.title : String(value)
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All majors (course core)</SelectItem>
            {aosOptions.map((a) => (
              <SelectItem key={a.code} value={a.code}>
                <span className="flex items-center gap-2">
                  <span className="inline-flex w-16 shrink-0 justify-start rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-muted-foreground uppercase tabular-nums">
                    {a.kind === "major" ? "Major" : a.kind}
                  </span>
                  <span className="text-[12px] leading-tight">{a.title}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <YearDepthRow
          year={year}
          depth={depth}
          availableYears={availableYears}
          onPickYear={onPickYear}
          onPickDepth={onPickDepth}
        />
      </div>
    </Section>
  )
}

function UnitBlock({
  unitCode,
  year,
  depth,
  direction,
  availableYears,
  onPickUnit,
  onPickDirection,
  onPickYear,
  onPickDepth,
}: {
  unitCode: string | null
  year: string
  depth: number
  direction: TreeDirection
  availableYears: string[]
  onPickUnit: (code: string) => void
  onPickDirection: (d: TreeDirection) => void
  onPickYear: (y: string) => void
  onPickDepth: (d: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [results, setResults] = useState<PlannerUnit[]>([])
  const qReady = q.trim().length >= 2
  useEffect(() => {
    if (!qReady) return
    let cancelled = false
    void searchUnitsAction(q, year).then((r) => {
      if (!cancelled) setResults(r)
    })
    return () => {
      cancelled = true
    }
  }, [q, year, qReady])
  // When the query is too short, just hide the results — no need to
  // synchronously reset state inside an effect.
  const visibleResults = qReady ? results : []

  return (
    <Section title="Unit">
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-xl border bg-background py-2 pr-9 pl-3 text-left hover:border-muted-foreground/40"
                >
                  <span className="inline-flex items-center gap-2 text-xs">
                    <SearchIcon className="size-3.5 text-muted-foreground" />
                    {unitCode ? (
                      <span className="font-bold tabular-nums">{unitCode}</span>
                    ) : (
                      <span className="text-muted-foreground">
                        Search unit code or title…
                      </span>
                    )}
                  </span>
                  {!unitCode ? (
                    <ChevronDownIcon className="size-3.5 text-muted-foreground" />
                  ) : null}
                </button>
              }
            />
            <PopoverContent className="w-[360px] p-2" align="start">
              <input
                autoFocus
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. FIT2004 or algorithms"
                className="mb-1.5 w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs"
              />
              <ul className="max-h-60 overflow-y-auto">
                {visibleResults.length === 0 && qReady ? (
                  <li className="px-2 py-1.5 text-xs text-muted-foreground italic">
                    No matches.
                  </li>
                ) : null}
                {visibleResults.map((u) => (
                  <li key={u.code}>
                    <button
                      type="button"
                      onClick={() => {
                        onPickUnit(u.code)
                        setOpen(false)
                        setQ("")
                      }}
                      className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                    >
                      <span className="text-[11px] font-bold tabular-nums">
                        {u.code}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {u.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
          {unitCode ? (
            <button
              type="button"
              aria-label="Clear unit"
              onClick={() => onPickUnit("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-1">
          {DIRECTIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => onPickDirection(d.value)}
              className={cn(
                "rounded-lg border px-2 py-1.5 text-[10px] leading-tight font-semibold transition-colors",
                direction === d.value
                  ? "border-[var(--monash-purple)] bg-[var(--monash-purple-soft)] text-[var(--monash-purple-deep)]"
                  : "border-border bg-background text-muted-foreground hover:border-muted-foreground/40"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>

        <YearDepthRow
          year={year}
          depth={depth}
          availableYears={availableYears}
          onPickYear={onPickYear}
          onPickDepth={onPickDepth}
        />
      </div>
    </Section>
  )
}

function YearDepthRow({
  year,
  depth,
  availableYears,
  onPickYear,
  onPickDepth,
}: {
  year: string
  depth: number
  availableYears: string[]
  onPickYear: (y: string) => void
  onPickDepth: (d: number) => void
}) {
  return (
    <div className="flex flex-col gap-2 border-t pt-2.5">
      <div className="flex items-center gap-2">
        <span className="w-12 shrink-0 text-[11px] text-muted-foreground">
          Year
        </span>
        <Select value={year} onValueChange={(v) => onPickYear(String(v))}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {availableYears.map((y) => (
              <SelectItem key={y} value={y}>
                Handbook {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-12 shrink-0 text-[11px] text-muted-foreground">
          Depth
        </span>
        <Slider
          className="flex-1"
          min={1}
          max={5}
          step={1}
          value={[depth]}
          onValueChange={(v) =>
            onPickDepth(Array.isArray(v) ? v[0] : (v as number))
          }
        />
        <span className="w-6 shrink-0 text-right text-[11px] font-semibold tabular-nums">
          {depth}
        </span>
      </div>
    </div>
  )
}

function PlanBlock({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (b: boolean) => void
}) {
  return (
    <Section title="My plan">
      <label className="flex cursor-pointer items-start gap-2 px-0.5 py-0.5">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--monash-purple)]"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-xs font-medium">Use my saved plan</span>
          <span className="text-[10px] leading-tight text-muted-foreground">
            Highlight units already in your plan; surface what&apos;s one prereq
            away.
          </span>
        </span>
      </label>
    </Section>
  )
}

function Legend() {
  return (
    <Section title="Legend">
      <ul className="flex flex-col gap-1.5 text-[11px]">
        <li className="flex items-center gap-2">
          <Swatch className="bg-[var(--monash-purple-soft)] ring-1 ring-primary/40" />
          Seed (the unit / major you picked)
        </li>
        <li className="flex items-center gap-2">
          <Swatch className="bg-background ring-1 ring-emerald-500/50" />
          In your plan
        </li>
        <li className="flex items-center gap-2">
          <SwatchLine className="bg-muted-foreground/50" />
          Prerequisite
        </li>
        <li className="flex items-center gap-2">
          <SwatchLine className="border-t border-dashed border-muted-foreground/60" />
          Corequisite
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden>🔒</span>
          Has enrolment-rule gate (course-locked, permission, WAM, …)
        </li>
      </ul>
    </Section>
  )
}

function Swatch({ className }: { className: string }) {
  return (
    <span className={cn("inline-block size-3 rounded-md border", className)} />
  )
}

function SwatchLine({ className }: { className: string }) {
  return <span className={cn("inline-block h-px w-6", className)} />
}
