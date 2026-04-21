"use client";

import { MinusIcon, MoreVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MAX_SLOT_CAPACITY,
  slotCapacity,
  type PlannerSlot,
} from "@/lib/planner/types";
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period";

import { usePlanner } from "./planner-context";
import { SemesterSlot } from "./semester-slot";

/**
 * The main planner pane — one row per (year, slot). The left label
 * column carries a three-dot menu that lets a student grow or shrink
 * the slot's unit capacity (1..MAX_SLOT_CAPACITY, never below the
 * units already placed).
 */
export function PlanGrid() {
  const { state, course, dispatch } = usePlanner();
  const startYear = Number(state.courseYear) || new Date().getFullYear();

  return (
    <div className="flex min-w-0 flex-col gap-0 rounded-3xl border bg-card shadow-card">
      {state.years.map((year, yearIndex) =>
        year.slots.map((slot, slotIndex) => (
          <SemesterRow
            key={`${yearIndex}:${slotIndex}:${slot.kind}`}
            yearIndex={yearIndex}
            slotIndex={slotIndex}
            slot={slot}
            yearLabel={`${PERIOD_KIND_LABEL[slot.kind]}, ${startYear + yearIndex}`}
            removableYear={state.years.length > 1 && slotIndex === 0}
            onRemoveYear={() => dispatch({ type: "remove_year", yearIndex })}
            showYearHeader={slotIndex === 0}
            yearHeaderLabel={year.label}
          />
        )),
      )}

      {!course ? (
        <div className="px-6 py-10 text-center text-xs text-muted-foreground">
          Pick a course on the right to get started.
        </div>
      ) : null}
    </div>
  );
}

function SemesterRow({
  yearIndex,
  slotIndex,
  slot,
  yearLabel,
  removableYear,
  onRemoveYear,
  showYearHeader,
  yearHeaderLabel,
}: {
  yearIndex: number;
  slotIndex: number;
  slot: PlannerSlot;
  yearLabel: string;
  removableYear: boolean;
  onRemoveYear: () => void;
  showYearHeader: boolean;
  yearHeaderLabel: string;
}) {
  const { dispatch } = usePlanner();
  const capacity = slotCapacity(slot);
  const canDecrease = capacity > Math.max(1, slot.unitCodes.length);
  const canIncrease = capacity < MAX_SLOT_CAPACITY;

  return (
    <>
      {showYearHeader ? (
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {yearHeaderLabel}
          </h3>
          {removableYear ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${yearHeaderLabel}`}
              onClick={onRemoveYear}
            >
              <Trash2Icon />
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-[180px_minmax(0,1fr)] items-stretch border-b last:border-b-0">
        <div className="flex items-center justify-between gap-1 border-r bg-muted/20 px-3 py-3 text-[11px] font-medium text-muted-foreground">
          <div className="leading-tight">
            <div>{yearLabel}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground/70 tabular-nums">
              {slot.unitCodes.length} / {capacity} units
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`${yearLabel} options`}
                  className="shrink-0"
                />
              }
            >
              <MoreVerticalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right" sideOffset={6}>
              <DropdownMenuItem
                disabled={!canIncrease}
                onClick={() =>
                  dispatch({
                    type: "set_slot_capacity",
                    yearIndex,
                    slotIndex,
                    capacity: capacity + 1,
                  })
                }
              >
                <PlusIcon />
                Add a unit slot
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canDecrease}
                onClick={() =>
                  dispatch({
                    type: "set_slot_capacity",
                    yearIndex,
                    slotIndex,
                    capacity: capacity - 1,
                  })
                }
              >
                <MinusIcon />
                Remove a unit slot
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SemesterSlot yearIndex={yearIndex} slotIndex={slotIndex} />
      </div>
    </>
  );
}
