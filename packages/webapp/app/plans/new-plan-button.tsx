"use client"

import { useState, useTransition } from "react"
import { PlusIcon } from "lucide-react"
import posthog from "posthog-js"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { createBlankPlanAction } from "@/app/actions"

/**
 * "New plan" CTA for the /plans page. Renders a year-picker dialog
 * before submitting — the first plan flow uses the bare form on the
 * page itself (no choice to make yet); this component covers every
 * subsequent plan so the student picks a starting handbook year
 * deliberately instead of silently inheriting whatever year is newest.
 */
export function NewPlanButton({
  availableYears,
}: {
  availableYears: string[]
}) {
  const [open, setOpen] = useState(false)
  const defaultYear = availableYears.at(-1) ?? ""
  const [year, setYear] = useState(defaultYear)
  const [isPending, startTransition] = useTransition()

  // The Select expects a non-empty default; if availableYears is empty
  // we fall back to letting the server pick (passes "" up, which the
  // action treats as "no year provided").
  const yearChoices =
    availableYears.length > 0 ? [...availableYears].reverse() : []

  function handleSubmit() {
    const fd = new FormData()
    if (year) fd.set("year", year)
    fd.set("name", "New plan")
    posthog.capture("plan_created", { handbook_year: year })
    startTransition(async () => {
      await createBlankPlanAction(fd)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setYear(defaultYear)
          setOpen(true)
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--monash-purple)]/40 bg-[var(--monash-purple-soft)] px-5 py-3 text-sm font-semibold text-[var(--monash-purple-deep)] transition-colors hover:border-[var(--monash-purple)] hover:bg-[var(--monash-purple)]/10"
      >
        <PlusIcon className="size-4" />
        New plan
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Start a new plan</DialogTitle>
            <DialogDescription>
              Pick the handbook year you want to plan against. You can change it
              later from inside the plan.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
              Starting year
            </label>
            <Select value={year} onValueChange={(v) => setYear(String(v))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {yearChoices.map((y) => (
                    <SelectItem key={y} value={y}>
                      Handbook {y}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending || !year}
              className="bg-[var(--monash-purple)] text-white hover:bg-[var(--monash-purple)]/90"
            >
              Create plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
