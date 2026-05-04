"use client"

import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
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

import { AoSPicker } from "./aos-picker"
import { usePlanner } from "./planner-context"

export function CoursePicker() {
  const { courses, course, switchCourse } = usePlanner()
  const [open, setOpen] = useState(false)

  const groupedByFaculty = useMemo(() => {
    const ORDER: Record<string, number> = {
      "UG comprehensive": 0,
      "UG specialist": 1,
      "UG double": 2,
      "Vertical double": 3,
      "Honours - 1 yr": 4,
      "PG Masters": 5,
      "Masters by research": 6,
      "UG diploma": 7,
      "PG Grad Cert / Grad Dip": 8,
    }
    const rank = (key: string) => ORDER[key] ?? 99

    const m = new Map<string, typeof courses>()
    for (const c of courses) {
      const key = c.type ?? "Other"
      const list = m.get(key) ?? []
      list.push(c)
      m.set(key, list)
    }
    return [...m.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
  }, [courses])

  return (
    <section className="rounded-3xl border bg-card p-3 shadow-card">
      <label className="px-1 text-[10px] tracking-wide text-muted-foreground uppercase">
        Course
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="mt-1 h-auto w-full justify-between gap-2 rounded-2xl px-3 py-2.5 text-left whitespace-normal"
            >
              <div className="min-w-0">
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {course?.code ?? "—"}
                </div>
                <div className="truncate text-sm leading-tight font-semibold">
                  {course?.title ?? "Choose a course"}
                </div>
              </div>
              <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
            </Button>
          }
        />
        <PopoverContent
          align="end"
          className="w-[min(520px,calc(100vw-2rem))] p-0"
        >
          <Command loop>
            <CommandInput placeholder="Search by code or title…" />
            <CommandList className="max-h-[420px]">
              <CommandEmpty>No course found.</CommandEmpty>
              {groupedByFaculty.map(([group, items]) => (
                <CommandGroup key={group} heading={group}>
                  {items.map((c) => (
                    <CommandItem
                      key={c.code}
                      value={`${c.code} ${c.title}`}
                      onSelect={() => {
                        void switchCourse(c.code)
                        setOpen(false)
                      }}
                      className="flex items-baseline gap-2 py-1.5"
                    >
                      <div className="flex min-w-0 flex-1 items-baseline gap-2">
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {c.code}
                        </span>
                        <span className="min-w-0 leading-snug whitespace-normal">
                          {c.title}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c.creditPoints}cp
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {course ? (
        <div className="mt-2 flex items-center justify-between border-t px-1 pt-2 text-[11px] text-muted-foreground">
          <span>{course.aqfLevel ?? "—"}</span>
          <div className="flex items-center gap-2">
            <span className="tabular-nums">{course.creditPoints}cp</span>
            <a
              href={`https://handbook.monash.edu/${course.year}/courses/${course.code}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View in handbook"
              className="hover:text-foreground"
            >
              <ExternalLinkIcon className="size-3" />
            </a>
          </div>
        </div>
      ) : null}

      {course ? (
        <div className="mt-2">
          <AoSPicker />
        </div>
      ) : null}
    </section>
  )
}
