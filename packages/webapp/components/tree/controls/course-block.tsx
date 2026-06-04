"use client"

import { ChevronDownIcon } from "lucide-react"
import { useMemo, useState } from "react"

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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PlannerAreaOfStudy, PlannerCourse } from "@/lib/planner/types"

import { ControlSection } from "./section"
import { YearDepthRow } from "./year-depth-row"

export function CourseBlock({
  courses,
  aosOptions,
  courseCode,
  aosCode,
  year,
  availableYears,
  onCourseChange,
  onAosChange,
  onYearChange,
}: {
  courses: PlannerCourse[]
  aosOptions: PlannerAreaOfStudy[]
  courseCode: string | null
  aosCode: string | null
  year: string
  availableYears: string[]
  onCourseChange: (code: string) => void
  onAosChange: (code: string | null) => void
  onYearChange: (y: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedCourse = useMemo(
    () => courses.find((c) => c.code === courseCode) ?? null,
    [courses, courseCode]
  )
  return (
    <ControlSection title="Course & major">
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
          <PopoverContent
            className="w-[min(360px,calc(100vw-2rem))] p-0"
            align="start"
          >
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
                        onCourseChange(c.code)
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
            onAosChange(s === "__all__" ? null : s)
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
            <SelectGroup>
              <SelectItem value="__all__">All majors (course core)</SelectItem>
              {aosOptions.map((a) => (
                <SelectItem key={a.code} value={a.code}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex shrink-0 items-center justify-center rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold tracking-wider whitespace-nowrap text-muted-foreground! uppercase tabular-nums">
                      {shortKindLabel(a.kind)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] leading-tight">
                      {a.title}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <YearDepthRow
          year={year}
          availableYears={availableYears}
          onYearChange={onYearChange}
        />
      </div>
    </ControlSection>
  )
}

/**
 * Compact uppercase labels for the AoS-kind badge in the major picker.
 * Raw enum values ("specialisation", "extended_major") blow out the
 * fixed-width badge slot — these are tuned to render at the same width
 * once uppercased.
 */
function shortKindLabel(kind: string): string {
  switch (kind) {
    case "major":
      return "Major"
    case "extended_major":
      return "Ext Maj"
    case "specialisation":
      return "Spec"
    case "minor":
      return "Minor"
    case "elective":
      return "Elective"
    default:
      return kind
  }
}
