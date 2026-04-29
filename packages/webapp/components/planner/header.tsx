"use client"

import { CalendarIcon, GraduationCapIcon } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { usePlanner } from "./planner-context"

export function Header() {
  const { isSyncing, state, availableYears, switchYear } = usePlanner()

  return (
    <header className="relative flex items-center justify-between overflow-hidden rounded-3xl border bg-card px-5 py-3 shadow-card print:border-none print:bg-transparent print:shadow-none">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground ring-2 ring-[var(--monash-purple)]/15">
            <GraduationCapIcon className="size-5" />
          </div>
          <span
            aria-hidden
            className="absolute -right-0.5 -bottom-0.5 block size-3 rounded-full bg-[var(--monash-purple)] ring-2 ring-card"
          />
        </div>
        <div>
          <h1 className="text-base leading-tight font-semibold">
            monmap{" "}
            <span className="font-normal text-[var(--monash-purple)]">
              / planner
            </span>
          </h1>
          <p className="text-[11px] text-muted-foreground">
            A course planner, by Monash Association of Coding
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {isSyncing ? (
          <span className="animate-pulse text-[11px] text-muted-foreground">
            syncing…
          </span>
        ) : null}
        <div className="flex items-center gap-2">
          <CalendarIcon className="size-3.5 text-muted-foreground" />
          <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
            Starting year
          </span>
          <Select
            value={state.courseYear}
            onValueChange={(v) => {
              if (typeof v === "string" && v) void switchYear(v)
            }}
          >
            <SelectTrigger className="h-8 min-w-[88px] text-xs">
              <SelectValue placeholder={state.courseYear} />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => (
                <SelectItem key={y} value={y} className="text-xs">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </header>
  )
}
