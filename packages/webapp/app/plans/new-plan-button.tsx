"use client"

import { useState, useTransition } from "react"
import { PlusIcon } from "lucide-react"

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
import { capture } from "@/lib/analytics"

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
    capture("plan_created", { handbook_year: year })
    startTransition(async () => {
      await createBlankPlanAction(fd)
    })
  }

  return (
    <>
      <NewPlanCard
        onClick={() => {
          setYear(defaultYear)
          setOpen(true)
        }}
      />

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
              className="bg-primary text-primary-foreground hover:bg-primary/80"
            >
              Create plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * The "New plan" card below the plan list, styled like the planner's
 * Add semester bar. The whole card is the button; the yellow pill in
 * the middle is its label, so clicking anywhere on the card works.
 */
export function NewPlanCard({
  type = "button",
  onClick,
}: {
  type?: "button" | "submit"
  onClick?: () => void
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="group flex min-h-24 w-full items-center justify-center rounded-panel border border-dashed bg-muted/20 px-4 py-4 transition-colors outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-card transition-colors group-hover:bg-primary/85">
        <PlusIcon className="size-4" />
        New plan
      </span>
    </button>
  )
}
