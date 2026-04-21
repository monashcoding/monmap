"use client";

import { SearchIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { searchUnitsAction } from "@/app/actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PERIOD_KIND_SHORT } from "@/lib/planner/teaching-period";
import type { PlannerUnit } from "@/lib/planner/types";
import { cn } from "@/lib/utils";

import { usePlanner } from "./planner-context";

/**
 * Debounce helper — small inline implementation so we don't drag in
 * a library for one use. The caller invokes the fn immediately but
 * the wrapped callback is only invoked after `delayMs` of quiet.
 */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function UnitSearchDialog({
  open,
  onOpenChange,
  yearIndex,
  slotIndex,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  yearIndex: number;
  slotIndex: number;
}) {
  const { dispatch, state, course, mergeUnits, units } = usePlanner();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlannerUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);

  const debounced = useDebounced(query, 180);
  const slotKind = state.years[yearIndex]?.slots[slotIndex]?.kind;

  // Quick-suggest when the dialog opens with no query — offer units
  // from the course's AoS that the student hasn't placed yet. Much
  // nicer than an empty dialog.
  const suggestions = useMemo<PlannerUnit[]>(() => {
    if (!course) return [];
    const placed = new Set<string>();
    for (const y of state.years) for (const s of y.slots) for (const c of s.unitCodes) placed.add(c);
    const seen = new Set<string>();
    const out: PlannerUnit[] = [];
    for (const aos of course.areasOfStudy) {
      for (const u of aos.units) {
        if (placed.has(u.code) || seen.has(u.code)) continue;
        seen.add(u.code);
        const full = units.get(u.code);
        if (full) out.push(full);
        if (out.length >= 20) break;
      }
      if (out.length >= 20) break;
    }
    return out;
  }, [course, state.years, units]);

  useEffect(() => {
    let cancelled = false;
    if (!debounced.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    searchUnitsAction(debounced)
      .then((list) => {
        if (cancelled) return;
        setResults(list);
        setLoading(false);
        mergeUnits(list);
      })
      .catch(() => {
        if (cancelled) return;
        setResults([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, mergeUnits]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setFocusIndex(0);
    }
  }, [open]);

  const items = debounced.trim() ? results : suggestions;

  useEffect(() => {
    if (focusIndex >= items.length) setFocusIndex(Math.max(0, items.length - 1));
  }, [items.length, focusIndex]);

  const addAndClose = useCallback(
    (code: string) => {
      dispatch({ type: "add_unit", yearIndex, slotIndex, code });
      onOpenChange(false);
    },
    [dispatch, yearIndex, slotIndex, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[720px] p-0 gap-0 h-[min(72vh,640px)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Search for a unit</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 border-b px-4 py-3">
          <SearchIcon className="size-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder={`Search units for ${slotKind ? PERIOD_KIND_SHORT[slotKind] : "this slot"}…  (try FIT1045 or "algorithms")`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setFocusIndex((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setFocusIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const picked = items[focusIndex];
                if (picked) addAndClose(picked.code);
              }
            }}
            className="h-9 border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="overflow-y-auto p-1.5">
          {!debounced.trim() && suggestions.length > 0 ? (
            <GroupHeading>Suggested from your course</GroupHeading>
          ) : null}
          {debounced.trim() && loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Searching…
            </div>
          ) : null}
          {debounced.trim() && !loading && results.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No matches for "{debounced}"
            </div>
          ) : null}

          <ul className="flex flex-col gap-0.5">
            {items.map((u, i) => (
              <li key={u.code}>
                <UnitRow
                  unit={u}
                  focused={i === focusIndex}
                  onHover={() => setFocusIndex(i)}
                  onClick={() => addAndClose(u.code)}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground">
          <span>
            <kbd className="rounded border bg-muted px-1 py-0.5">↑</kbd>{" "}
            <kbd className="rounded border bg-muted px-1 py-0.5">↓</kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="rounded border bg-muted px-1 py-0.5">↵</kbd>{" "}
            add · <kbd className="rounded border bg-muted px-1 py-0.5">esc</kbd>{" "}
            close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function UnitRow({
  unit,
  focused,
  onHover,
  onClick,
}: {
  unit: PlannerUnit;
  focused: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onFocus={onHover}
      onClick={onClick}
      className={cn(
        "flex w-full items-baseline gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
        focused ? "bg-accent text-accent-foreground" : "hover:bg-muted",
      )}
    >
      <span className="text-xs font-semibold tabular-nums shrink-0">
        {unit.code}
      </span>
      <span className="flex-1 truncate">{unit.title}</span>
      <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
        {unit.creditPoints}cp
      </span>
    </button>
  );
}
