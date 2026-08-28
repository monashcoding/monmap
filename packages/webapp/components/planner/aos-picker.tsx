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
  MAX_PICKS_PER_SLOT,
  computeAosSlotsWithRepeats,
  legacyKeyServing,
  repeatSlotKey,
  resolveSlotSelection,
} from "@/lib/planner/aos-slots"
import { isOutOfCampusScope, optionsForCampus } from "@/lib/planner/campus"
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
  const { course, campuses, state, dispatch } = usePlanner()
  if (!course) return null

  // Repeat slots ("major#2") appear one at a time as the student fills
  // the one before — see lib/planner/aos-slots.ts.
  const slots = computeAosSlotsWithRepeats(course, state.selectedAos)
  if (slots.length === 0 && campuses.length === 0) return null

  return (
    <div className="flex flex-col gap-2 border-t pt-2">
      {campuses.length > 0 ? (
        <CampusSelect
          campuses={campuses}
          current={state.campus}
          onChange={(campus) => {
            posthog.capture("campus_selected", {
              campus,
              course_code: course.code,
            })
            dispatch({ type: "set_campus", campus })
          }}
        />
      ) : null}
      {slots.map((slot) => {
        const current = resolveSlotSelection(state.selectedAos, slot)
        const options = optionsForCampus(
          slot.options,
          state.campus,
          current,
          campuses
        )
        // A slot whose options are entirely other-campus has nothing to
        // offer — an empty dropdown headed "Clayton options
        // specialisation" is worse than no dropdown at all.
        if (options.length === 0) return null
        return (
          <RoleSelect
            key={slot.key}
            label={slot.label}
            // Filtered to the chosen campus, but never dropping the
            // student's own pick — see lib/planner/campus.ts.
            options={options}
            current={current}
            campus={state.campus}
            knownCampuses={campuses}
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
              // Clearing a pick must also clear the repeat slots above
              // it, or a higher pick ("major#3") is orphaned behind an
              // empty one and stops rendering while staying in state.
              const orphaned = code ? [] : higherRepeatKeys(slot.key)
              const alsoClear = [...(legacy ? [legacy] : []), ...orphaned]
              dispatch({
                type: "set_aos",
                role: slot.key,
                code,
                ...(alsoClear.length > 0 ? { alsoClear } : {}),
              })
            }}
          />
        )
      })}
    </div>
  )
}

/**
 * Plan-level campus preference. Only rendered when the course actually
 * scopes something by campus — most courses don't, and an inert
 * control would just be noise.
 */
function CampusSelect({
  campuses,
  current,
  onChange,
}: {
  campuses: string[]
  current: string | undefined
  onChange: (campus: string | null) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="px-1 text-[10px] leading-tight font-semibold text-muted-foreground uppercase">
        Campus
      </label>
      <Select
        value={current ?? ALL_CAMPUSES}
        onValueChange={(v) =>
          onChange(typeof v === "string" && v !== ALL_CAMPUSES ? v : null)
        }
      >
        <SelectTrigger className="w-full min-w-0 items-center py-2.5 text-xs">
          {/* Explicit children: Base UI renders the raw value string
              otherwise, which surfaced the ALL_CAMPUSES sentinel to
              the user as "__all__". */}
          <SelectValue>{current ?? "All campuses"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={ALL_CAMPUSES} className="py-2.5">
              All campuses
            </SelectItem>
            {campuses.map((c) => (
              <SelectItem key={c} value={c} className="py-2.5">
                {c}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

/** Sentinel: Base UI selects can't hold an empty value as a real choice. */
const ALL_CAMPUSES = "__all__"

/**
 * Repeat-slot keys ranked above `key`, so clearing a pick takes the
 * picks that depended on it. "major" yields major#2..#N; "major#2"
 * yields major#3..#N.
 */
function higherRepeatKeys(key: string): string[] {
  const hash = key.lastIndexOf("#")
  const base = hash === -1 ? key : key.slice(0, hash)
  const from = hash === -1 ? 2 : Number(key.slice(hash + 1)) + 1
  const out: string[] = []
  for (let n = from; n <= MAX_PICKS_PER_SLOT; n++)
    out.push(repeatSlotKey(base, n))
  return out
}

function RoleSelect({
  label,
  options,
  current,
  campus,
  knownCampuses,
  year,
  onChange,
}: {
  label: string
  options: PlannerAreaOfStudy[]
  current: string | undefined
  campus?: string | undefined
  knownCampuses: string[]
  year: string
  onChange: (code: string | null) => void
}) {
  const sorted = useMemo(
    () => [...options].sort((a, b) => a.title.localeCompare(b.title)),
    [options]
  )
  // A pick made before the campus was chosen (or before switching it)
  // stays selected — flagged rather than deleted, so the student
  // decides what to do about it.
  const selected = current ? options.find((a) => a.code === current) : undefined
  const outOfScope = selected
    ? isOutOfCampusScope(selected, campus, knownCampuses)
    : false

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
                        {sel.scope ? <CampusChip scope={sel.scope} /> : null}
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
                    {a.scope ? <CampusChip scope={a.scope} /> : null}
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
      {outOfScope && selected ? (
        <p className="px-1 text-[10px] leading-tight text-muted-foreground">
          Not offered at {campus} — {selected.scope} only.
        </p>
      ) : null}
    </div>
  )
}

/**
 * Campus marker on an option the handbook offers at one campus only.
 * E3001 splits its 22 engineering minors into "Malaysia offerings" and
 * "Clayton offerings"; without this a Clayton student browses nine
 * Malaysia-only minors that look exactly like the ones they can take,
 * and a Malaysia student wonders where theirs went ("the engineering
 * minors dont show Malaysia minors").
 *
 * Yellow tint pairs with `text-primary-foreground`, never `text-primary`
 * — see the brand rule in CLAUDE.md.
 */
function CampusChip({ scope }: { scope: string }) {
  return (
    <span className="shrink-0 rounded bg-primary/40 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-primary-foreground uppercase">
      {scope}
    </span>
  )
}
