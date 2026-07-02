"use client"

import { ExternalLinkIcon, XIcon } from "lucide-react"
import { useMemo } from "react"
import posthog from "posthog-js"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  computeAosSlots,
  legacyKeyServing,
  resolveSlotSelection,
} from "@/lib/planner/aos-slots"
import type { PlannerAreaOfStudy } from "@/lib/planner/types"

import { usePlanner } from "./planner-context"

/**
 * Sidebar-oriented AoS picker — one row per selection slot, stacked.
 * Slots hide when the course doesn't offer them (a PhD has none, a BCS
 * has specialisations but no majors); double degrees get one slot per
 * component per kind, so a Science major and a CS specialisation are
 * independent picks (see lib/planner/aos-slots.ts).
 */
export function AoSPicker() {
  const { course, state, dispatch } = usePlanner()
  if (!course) return null

  const slots = computeAosSlots(course)
  if (slots.length === 0) return null

  return (
    <div className="flex flex-col gap-2 border-t pt-2">
      {slots.map((slot) => (
        <RoleSelect
          key={slot.key}
          label={slot.label}
          options={slot.options}
          current={resolveSlotSelection(state.selectedAos, slot)}
          year={course.year}
          onChange={(code) => {
            if (code) {
              const selected = slot.options.find((o) => o.code === code)
              posthog.capture("area_of_study_selected", {
                aos_code: code,
                aos_title: selected?.title,
                aos_kind: slot.kind,
                aos_role: slot.key,
                course_code: course.code,
              })
            }
            // A legacy fixed-role value serving this slot must clear in
            // the same step, or it resurfaces as the slot's fallback.
            const legacy = legacyKeyServing(state.selectedAos, slot)
            dispatch({
              type: "set_aos",
              role: slot.key,
              code,
              ...(legacy ? { alsoClear: [legacy] } : {}),
            })
          }}
        />
      ))}
    </div>
  )
}

function RoleSelect({
  label,
  options,
  current,
  year,
  onChange,
}: {
  label: string
  options: PlannerAreaOfStudy[]
  current: string | undefined
  year: string
  onChange: (code: string | null) => void
}) {
  const sorted = useMemo(
    () => [...options].sort((a, b) => a.title.localeCompare(b.title)),
    [options]
  )

  return (
    <div className="flex flex-col gap-1">
      <label className="px-1 text-[10px] leading-tight font-semibold text-muted-foreground uppercase">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <Select
          value={current ?? ""}
          onValueChange={(v) =>
            onChange(typeof v === "string" && v !== "" ? v : null)
          }
        >
          <SelectTrigger className="min-w-0 flex-1 items-center py-2.5 text-xs [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:flex-1 [&_[data-slot=select-value]]:truncate [&>span]:flex [&>span]:min-w-0 [&>span]:flex-1 [&>span]:items-baseline [&>span]:gap-2">
            <SelectValue placeholder="Select…">
              {current
                ? (() => {
                    const sel = sorted.find((a) => a.code === current)
                    if (!sel) return null
                    return (
                      <>
                        {sel.code.includes(":") ? null : (
                          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                            {sel.code}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {sel.title}
                        </span>
                      </>
                    )
                  })()
                : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[320px] min-w-[360px]">
            <SelectGroup>
              {sorted.map((a) => (
                <SelectItem
                  key={a.code}
                  value={a.code}
                  className="items-baseline py-2.5 pr-12 pl-3.5"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    {a.code.includes(":") ? null : (
                      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                        {a.code}
                      </span>
                    )}
                    <span className="whitespace-normal">{a.title}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {current ? (
          <>
            <a
              href={`https://handbook.monash.edu/${year}/aos/${current}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              aria-label="View in handbook"
            >
              <ExternalLinkIcon className="size-3.5" />
            </a>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Clear ${label.toLowerCase()}`}
              onClick={() => onChange(null)}
            >
              <XIcon />
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}
