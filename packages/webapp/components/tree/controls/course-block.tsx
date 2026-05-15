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
  depth,
  availableYears,
  onCourseChange,
  onAosChange,
  onYearChange,
  onDepthChange,
}: {
  courses: PlannerCourse[]
  aosOptions: PlannerAreaOfStudy[]
  courseCode: string | null
  aosCode: string | null
  year: string
  depth: number
  availableYears: string[]
  onCourseChange: (code: string) => void
  onAosChange: (code: string | null) => void
  onYearChange: (y: string) => void
  onDepthChange: (d: number) => void
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
          onYearChange={onYearChange}
          onDepthChange={onDepthChange}
        />
      </div>
    </ControlSection>
  )
}
