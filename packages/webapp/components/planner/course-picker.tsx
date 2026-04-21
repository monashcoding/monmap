"use client";

import { ChevronDownIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { AoSPicker } from "./aos-picker";
import { usePlanner } from "./planner-context";

export function CoursePicker() {
  const { courses, course, switchCourse } = usePlanner();
  const [open, setOpen] = useState(false);

  const groupedByFaculty = useMemo(() => {
    const m = new Map<string, typeof courses>();
    for (const c of courses) {
      const key = c.type ?? "Other";
      const list = m.get(key) ?? [];
      list.push(c);
      m.set(key, list);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [courses]);

  return (
    <section className="rounded-3xl border bg-card p-3 shadow-card">
      <label className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        Course
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="mt-1 h-auto w-full justify-between gap-2 whitespace-normal rounded-2xl px-3 py-2.5 text-left"
            >
              <div className="min-w-0">
                <div className="text-[11px] tabular-nums text-muted-foreground">
                  {course?.code ?? "—"}
                </div>
                <div className="truncate text-sm font-semibold leading-tight">
                  {course?.title ?? "Choose a course"}
                </div>
              </div>
              <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
            </Button>
          }
        />
        <PopoverContent align="end" className="w-[min(520px,calc(100vw-2rem))] p-0">
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
                        void switchCourse(c.code);
                        setOpen(false);
                      }}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                          {c.code}
                        </span>
                        <span className="truncate">{c.title}</span>
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
        <div className="mt-2 flex items-center justify-between border-t pt-2 px-1 text-[11px] text-muted-foreground">
          <span>{course.aqfLevel ?? "—"}</span>
          <span className="tabular-nums">{course.creditPoints}cp</span>
        </div>
      ) : null}

      {course ? (
        <div className="mt-2">
          <AoSPicker />
        </div>
      ) : null}
    </section>
  );
}
