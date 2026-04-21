"use client";

import { CheckIcon, CircleIcon } from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import {
  summarizeAoSProgress,
  type AoSProgress,
} from "@/lib/planner/progress";
import type { PlannerAreaOfStudy, PlannerState } from "@/lib/planner/types";
import { cn } from "@/lib/utils";

import { usePlanner } from "./planner-context";

const ROLE_LABEL: Record<keyof PlannerState["selectedAos"], string> = {
  major: "Major",
  extendedMajor: "Extended major",
  minor: "Minor",
  specialisation: "Specialisation",
  elective: "Elective",
};

/**
 * Sidebar requirements panel. Shows each picked AoS as a collapsible
 * progress card with inline unit chips that light up as the student
 * places matching codes in the plan.
 */
export function RequirementsPanel() {
  const { course, state, units, plannedCodes } = usePlanner();

  const pickedAos = useMemo((): PickedAoS[] => {
    if (!course) return [];
    const picked: PickedAoS[] = [];
    for (const [role, code] of Object.entries(state.selectedAos)) {
      if (!code) continue;
      const aos = course.areasOfStudy.find((a) => a.code === code);
      if (!aos) continue;
      picked.push({ role: role as keyof PlannerState["selectedAos"], aos });
    }
    return picked;
  }, [course, state.selectedAos]);

  const withProgress = useMemo<(PickedAoS & { progress: AoSProgress })[]>(
    () =>
      pickedAos.map((p) => ({
        ...p,
        progress: summarizeAoSProgress(p.aos, plannedCodes, units),
      })),
    [pickedAos, plannedCodes, units],
  );

  return (
    <section className="rounded-3xl border bg-card shadow-card">
      <div className="border-b px-4 py-2.5">
        <h2 className="text-xs font-semibold tracking-tight">
          Requirements progress
        </h2>
      </div>

      <div className="flex flex-col divide-y">
        {withProgress.length === 0 ? (
          <div className="px-4 py-6 text-center text-[11px] text-muted-foreground">
            Pick a major, minor or specialisation to see listed units.
          </div>
        ) : (
          withProgress.map(({ role, aos, progress }) => (
            <AoSBlock
              key={`${role}:${aos.code}`}
              role={role}
              aos={aos}
              progress={progress}
              plannedCodes={plannedCodes}
            />
          ))
        )}
      </div>
    </section>
  );
}

interface PickedAoS {
  role: keyof PlannerState["selectedAos"];
  aos: PlannerAreaOfStudy;
}

function AoSBlock({
  role,
  aos,
  progress,
  plannedCodes,
}: {
  role: keyof PlannerState["selectedAos"];
  aos: PlannerAreaOfStudy;
  progress: AoSProgress;
  plannedCodes: ReadonlySet<string>;
}) {
  const byGrouping = useMemo(() => {
    const m = new Map<string, { code: string; placed: boolean }[]>();
    for (const u of aos.units) {
      const list = m.get(u.grouping) ?? [];
      list.push({ code: u.code, placed: plannedCodes.has(u.code) });
      m.set(u.grouping, list);
    }
    return [...m.entries()].map(([group, items]) => ({
      group,
      items: items.sort((a, b) => a.code.localeCompare(b.code)),
    }));
  }, [aos.units, plannedCodes]);

  const completionPct =
    aos.units.length === 0
      ? 0
      : Math.round((progress.completedCodes.length / aos.units.length) * 100);

  return (
    <section className="px-4 py-3">
      <header className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[9px] font-normal">
              {ROLE_LABEL[role]}
            </Badge>
            <span className="text-[9px] text-muted-foreground">
              {aos.code}
            </span>
          </div>
          <h3 className="mt-0.5 truncate text-xs font-semibold">{aos.title}</h3>
        </div>
        <div className="text-right leading-tight">
          <div className="text-[11px] tabular-nums">
            <span className="font-semibold">{progress.completedCodes.length}</span>
            <span className="text-muted-foreground">/{aos.units.length}</span>
          </div>
          <div className="text-[9px] text-muted-foreground">listed</div>
        </div>
      </header>

      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${completionPct}%` }}
        />
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {byGrouping.map(({ group, items }) => (
          <div key={group}>
            <div className="mb-1 text-[9px] uppercase tracking-wide text-muted-foreground">
              {group}
            </div>
            <ul className="flex flex-wrap gap-1">
              {items.map((it) => (
                <li key={it.code}>
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 rounded-md border px-1 py-0.5 text-[9px] tabular-nums transition-colors",
                      it.placed
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {it.placed ? (
                      <CheckIcon className="size-2" />
                    ) : (
                      <CircleIcon className="size-2" />
                    )}
                    {it.code}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
