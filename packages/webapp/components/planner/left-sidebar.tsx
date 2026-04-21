"use client";

import {
  BadgeCheckIcon,
  DownloadIcon,
  PlusCircleIcon,
  PrinterIcon,
  RotateCcwIcon,
  UploadIcon,
} from "lucide-react";
import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { PlannerState } from "@/lib/planner/types";

import { usePlanner } from "./planner-context";

/**
 * Vertical action rail, left side. Matches the MonPlan floating
 * sidebar idiom — four discoverable verbs as icon buttons with
 * text labels. State-only operations (no server round-trip).
 */
export function LeftSidebar() {
  const { state, dispatch, validations, switchCourse } = usePlanner();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const errorCount = useMemo(() => {
    let n = 0;
    for (const v of validations.values()) n += v.errors.length;
    return n;
  }, [validations]);

  const onReset = useCallback(() => {
    if (!confirm("Reset the whole plan? This clears every unit you've placed.")) return;
    const prevCourse = state.courseCode;
    dispatch({ type: "reset" });
    if (prevCourse) void switchCourse(prevCourse);
  }, [dispatch, state.courseCode, switchCourse]);

  const onExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `monmap-plan-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Plan exported");
  }, [state]);

  const onImport = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as PlannerState;
      if (!parsed || !Array.isArray(parsed.years)) {
        throw new Error("File isn't a monmap plan");
      }
      dispatch({ type: "hydrate", state: parsed });
      if (parsed.courseCode) void switchCourse(parsed.courseCode);
      toast.success("Plan imported");
    } catch (err) {
      toast.error("Couldn't import plan", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [dispatch, switchCourse]);

  const onPrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <aside className="flex flex-col gap-1 self-start rounded-3xl border bg-card p-2 shadow-card print:hidden">
      <ActionButton
        icon={<BadgeCheckIcon />}
        label="Validate"
        description={errorCount === 0 ? "All good" : `${errorCount} issue${errorCount === 1 ? "" : "s"}`}
        tone={errorCount === 0 ? "good" : "bad"}
        onClick={() => {
          toast[errorCount === 0 ? "success" : "warning"](
            errorCount === 0
              ? "Plan validates cleanly"
              : `${errorCount} validation issue${errorCount === 1 ? "" : "s"}`,
            {
              description:
                errorCount === 0
                  ? "Every unit meets its prereqs and is offered in its slot."
                  : "Hover or tap a red unit card to see details.",
            },
          );
        }}
      />

      <ActionButton
        icon={<PlusCircleIcon />}
        label="Add year"
        onClick={() => dispatch({ type: "add_year" })}
      />

      <ActionButton
        icon={<DownloadIcon />}
        label="Export"
        onClick={onExport}
      />

      <ActionButton
        icon={<UploadIcon />}
        label="Import"
        onClick={() => fileInputRef.current?.click()}
      />

      <ActionButton
        icon={<PrinterIcon />}
        label="Print"
        onClick={onPrint}
      />

      <ActionButton
        icon={<RotateCcwIcon />}
        label="Reset"
        onClick={onReset}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onImport(f);
          e.target.value = "";
        }}
      />
    </aside>
  );
}

function ActionButton({
  icon,
  label,
  description,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  tone?: "good" | "bad";
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className="flex h-auto w-full flex-col items-center gap-1 rounded-2xl px-1 py-3 text-xs"
    >
      <span
        className={
          tone === "good"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "bad"
              ? "text-destructive"
              : "text-foreground"
        }
      >
        {icon}
      </span>
      <span className="text-[10px] font-medium leading-none">{label}</span>
      {description ? (
        <span className="text-[9px] font-normal leading-none text-muted-foreground">
          {description}
        </span>
      ) : null}
    </Button>
  );
}
