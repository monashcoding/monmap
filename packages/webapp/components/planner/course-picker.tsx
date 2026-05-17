"use client"

import { ChevronDownIcon, ExternalLinkIcon, Share2Icon } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
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

export function CoursePicker({ className }: { className?: string }) {
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
    return [...m.entries()].sort(
      ([a], [b]) => rank(a) - rank(b) || a.localeCompare(b)
    )
  }, [courses])

  return (
    <section
      className={cn("rounded-3xl border bg-card p-3 shadow-card", className)}
    >
      <label className="px-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        Course
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <div className="relative mt-1">
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                className="h-auto w-full justify-between gap-2 rounded-2xl px-4 py-3.5 text-left whitespace-normal"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {course?.code ?? "—"}
                  </div>
                  <div className="mt-1.5 text-sm leading-tight font-semibold break-words whitespace-normal">
                    {course?.title ?? "Choose a course"}
                  </div>
                  {course ? (
                    <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                      <span className="min-w-0 break-words whitespace-normal">
                        {course.aqfLevel ?? "—"}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {course.creditPoints}cp
                      </span>
                    </div>
                  ) : null}
                </div>
                <ChevronDownIcon className="size-4 shrink-0 self-center text-muted-foreground" />
              </Button>
            }
          />
          {course ? (
            <div className="absolute top-3.5 right-10 z-10 flex items-center gap-3">
              <a
                href={`/tree?course=${course.code}&year=${course.year}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Share2Icon className="size-3" />
                Tree
              </a>
              <a
                href={`https://handbook.monash.edu/${course.year}/courses/${course.code}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLinkIcon className="size-3" />
                Handbook
              </a>
            </div>
          ) : null}
        </div>
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
        <div className="mt-2">
          <AoSPicker />
        </div>
      ) : null}
    </section>
  )
}
