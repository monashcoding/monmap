"use client";

import {
  AlertTriangleIcon,
  CircleAlertIcon,
  MoreVerticalIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { facultyStyle } from "@/lib/planner/faculty-color";
import { keyFor } from "@/lib/planner/validation";
import { cn } from "@/lib/utils";

import { usePlanner } from "./planner-context";
import { UnitDetailPopover } from "./unit-detail-popover";

/**
 * A single unit card — MonPlan-style with a faculty-coloured left
 * rail carrying the rotated prefix, code and truncated title, a
 * credit-points line, and a 3-dot menu. Validation state is
 * conveyed by a subtle outline + an inline icon (not a colour swap
 * on the rail, which would collide with faculty colour).
 */
const CARD_HEIGHT = "h-[88px]";

export function UnitCard({
  code,
  yearIndex,
  slotIndex,
}: {
  code: string;
  yearIndex: number;
  slotIndex: number;
}) {
  const { units, validations, dispatch, flashVersion } = usePlanner();
  const unit = units.get(code);
  const validation = validations.get(keyFor(yearIndex, slotIndex, code));
  const faculty = useMemo(() => facultyStyle(code), [code]);
  const [menuOpen, setMenuOpen] = useState(false);

  const status = useMemo((): CardStatus => {
    if (!validation) return "loading";
    if (validation.errors.length > 0) return "error";
    if (validation.warnings.length > 0) return "warn";
    return "ok";
  }, [validation]);

  // Pulse the card when the user presses Validate and this card has
  // outstanding errors. We key on flashVersion (a monotonic counter)
  // so re-clicking Validate re-runs the animation even if the error
  // set is unchanged.
  const [isFlashing, setIsFlashing] = useState(false);
  const lastFlashRef = useRef(0);
  useEffect(() => {
    if (flashVersion === lastFlashRef.current) return;
    lastFlashRef.current = flashVersion;
    if (flashVersion === 0 || status !== "error") return;
    setIsFlashing(true);
    const t = setTimeout(() => setIsFlashing(false), 1700);
    return () => clearTimeout(t);
  }, [flashVersion, status]);

  return (
    <div
      data-validation-status={status}
      className={cn(
        "group/card relative flex min-w-0 items-stretch overflow-hidden rounded-xl border bg-background shadow-card transition-[transform,box-shadow,border-color] duration-200 animate-in fade-in-0 slide-in-from-top-1",
        "hover:-translate-y-px",
        CARD_HEIGHT,
        status === "error" && "border-destructive/70 ring-1 ring-destructive/25",
        status === "warn" && "border-amber-500/70 ring-1 ring-amber-500/20",
        status === "ok" && "border-border",
        status === "loading" && "border-dashed",
        isFlashing && "animate-validation-flash",
      )}
    >
      <div
        aria-hidden
        className={cn(
          "flex w-6 shrink-0 items-center justify-center",
          faculty.railClass,
          faculty.railTextClass,
        )}
      >
        <span className="rotate-180 text-[10px] font-bold tracking-widest [writing-mode:vertical-rl]">
          {faculty.label}
        </span>
      </div>

      <UnitDetailPopover code={code} yearIndex={yearIndex} slotIndex={slotIndex}>
        <button
          className="flex min-w-0 flex-1 flex-col items-stretch gap-0.5 px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          aria-label={`Details for ${code}`}
          type="button"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold tabular-nums">
              {code}
            </span>
            <StatusIcon status={status} />
          </div>
          <div className="line-clamp-2 text-[11px] leading-snug text-foreground/90">
            {unit?.title ?? <span className="text-muted-foreground italic">Loading…</span>}
          </div>
          <div className="mt-auto text-[10px] font-medium tabular-nums text-muted-foreground">
            {unit ? `${unit.creditPoints} Credit Points` : ""}
          </div>
        </button>
      </UnitDetailPopover>

      <UnitMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onRemove={() =>
          dispatch({ type: "remove_unit", yearIndex, slotIndex, code })
        }
      />
    </div>
  );
}

function UnitMenu({
  open,
  onOpenChange,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <div className="absolute right-0 top-0 flex items-start p-0.5">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onOpenChange(!open)}
        aria-label="Unit options"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVerticalIcon className="size-3.5" />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-1 top-6 z-10 flex w-max flex-col rounded-xl border bg-popover p-1 shadow-lg"
          onMouseLeave={() => onOpenChange(false)}
        >
          <button
            role="menuitem"
            onClick={() => {
              onOpenChange(false);
              onRemove();
            }}
            className="flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
          >
            <XIcon className="size-3" />
            Remove unit
          </button>
        </div>
      ) : null}
    </div>
  );
}

type CardStatus = "ok" | "warn" | "error" | "loading";

function StatusIcon({ status }: { status: CardStatus }) {
  if (status === "error")
    return <CircleAlertIcon className="size-3 text-destructive" aria-label="has errors" />;
  if (status === "warn")
    return <AlertTriangleIcon className="size-3 text-amber-500" aria-label="has warnings" />;
  return null;
}
