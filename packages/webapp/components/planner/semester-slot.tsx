"use client";

import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { slotCapacity } from "@/lib/planner/types";

import { usePlanner } from "./planner-context";
import { UnitCard } from "./unit-card";
import { UnitSearchDialog } from "./unit-search-dialog";

/**
 * Row of unit cards for a single (year, slot). The "Add unit"
 * affordance only shows when the slot has room — capacity per slot
 * is editable from the slot's three-dot menu in the left rail.
 */
export function SemesterSlot({
  yearIndex,
  slotIndex,
}: {
  yearIndex: number;
  slotIndex: number;
}) {
  const { state } = usePlanner();
  const [open, setOpen] = useState(false);

  const slot = state.years[yearIndex]?.slots[slotIndex];

  if (!slot) return null;

  const capacity = slotCapacity(slot);
  const atCapacity = slot.unitCodes.length >= capacity;

  return (
    <div
      className="grid min-w-0 items-stretch gap-2 p-2"
      style={{
        gridTemplateColumns: `repeat(${capacity}, minmax(0, 1fr))`,
      }}
    >
      {slot.unitCodes.map((code) => (
        <UnitCard
          key={code}
          code={code}
          yearIndex={yearIndex}
          slotIndex={slotIndex}
        />
      ))}

      {!atCapacity ? (
        <Button
          variant="ghost"
          className="h-[88px] rounded-xl border border-dashed border-border/80 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setOpen(true)}
        >
          <div className="flex flex-col items-center gap-0.5">
            <PlusIcon className="size-4" />
            <span className="text-[10px] uppercase tracking-wide">Add unit</span>
          </div>
        </Button>
      ) : null}

      <UnitSearchDialog
        open={open}
        onOpenChange={setOpen}
        yearIndex={yearIndex}
        slotIndex={slotIndex}
      />
    </div>
  );
}
