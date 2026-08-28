"use client"

import { TrashIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { creditEntryLabel } from "@/lib/planner/credit"

import { usePlanner } from "./planner-context"

const UNIT_CODE = /^[A-Z]{3}[0-9]{4}$/

/**
 * Advanced standing: units and credit points the student already holds
 * coming into this plan.
 *
 * Credit is not a year of slots. A credited unit has no teaching
 * period, campus or offering, so a slot would mean inventing all three
 * and then suppressing the validation they'd trigger — which is
 * precisely the hand-rolled workaround students described ("the unit
 * exemptions are hard to simulate in the plan without adding another
 * 'fake year' with exempted units").
 */
export function CreditDialog({
  open,
  onOpenChangeAction,
}: {
  open: boolean
  onOpenChangeAction: (v: boolean) => void
}) {
  const { state, dispatch, units } = usePlanner()
  const entries = state.credit ?? []

  const [code, setCode] = useState("")
  const [points, setPoints] = useState("6")
  const [label, setLabel] = useState("")

  const trimmedCode = code.trim().toUpperCase()
  const codeLooksValid = trimmedCode === "" || UNIT_CODE.test(trimmedCode)
  const creditPoints = Number(points)
  const pointsValid = Number.isFinite(creditPoints) && creditPoints > 0
  const duplicate =
    trimmedCode !== "" && entries.some((e) => e.code === trimmedCode)
  const canAdd = codeLooksValid && pointsValid && !duplicate

  function add() {
    if (!canAdd) return
    dispatch({
      type: "add_credit",
      entry: {
        code: trimmedCode || null,
        creditPoints,
        ...(label.trim() ? { label: label.trim() } : {}),
      },
    })
    setCode("")
    setPoints("6")
    setLabel("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Credit and advanced standing</DialogTitle>
          <DialogDescription>
            Study you already have credit for. Named units satisfy prerequisites
            and count toward your requirements; credit with no unit code just
            adds its points to your total.
          </DialogDescription>
        </DialogHeader>

        {entries.length > 0 ? (
          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {entries.map((entry, i) => (
              <li
                key={`${entry.code ?? "block"}:${i}`}
                className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {creditEntryLabel(entry)}
                  {entry.code ? (
                    <span className="ml-2 font-normal text-muted-foreground">
                      {units.get(entry.code)?.title ?? entry.label ?? ""}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {entry.creditPoints}cp
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${creditEntryLabel(entry)}`}
                  className="size-6 shrink-0 p-0"
                  onClick={() => dispatch({ type: "remove_credit", index: i })}
                >
                  <TrashIcon className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            No credit recorded yet.
          </p>
        )}

        <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_5rem_auto]">
          <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <Label htmlFor="credit-code" className="text-[11px]">
              Unit code (optional)
            </Label>
            <Input
              id="credit-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="FIT1045"
              aria-invalid={!codeLooksValid || duplicate}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="credit-points" className="text-[11px]">
              Points
            </Label>
            <Input
              id="credit-points"
              value={points}
              inputMode="numeric"
              onChange={(e) => setPoints(e.target.value)}
              aria-invalid={!pointsValid}
              className="h-8 text-xs"
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <Label htmlFor="credit-label" className="text-[11px]">
              Note (optional)
            </Label>
            <Input
              id="credit-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="VCE Algorithmics, Deakin transfer…"
              className="h-8 text-xs"
            />
          </div>
        </div>

        {duplicate ? (
          <p className="text-[11px] text-destructive">
            {trimmedCode} is already credited.
          </p>
        ) : !codeLooksValid ? (
          <p className="text-[11px] text-destructive">
            Unit codes look like FIT1045 — leave it blank for credit that
            isn&apos;t tied to a specific unit.
          </p>
        ) : null}

        <DialogFooter>
          <Button size="sm" onClick={add} disabled={!canAdd}>
            Add credit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
