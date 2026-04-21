"use client";

import { ExternalLinkIcon, InfoIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period";
import { keyFor } from "@/lib/planner/validation";
import type { PeriodKind, PlannerOffering, RequisiteBlock } from "@/lib/planner/types";
import { cn } from "@/lib/utils";

import { usePlanner } from "./planner-context";
import { RequisiteTreeView } from "./requisite-tree-view";

/**
 * Popover that shows everything the student might want to see about
 * a placed unit:
 *   - synopsis (HTML from handbook)
 *   - offerings (which periods + locations are offered)
 *   - prerequisite / corequisite trees (with student's completion state)
 *   - prohibitions
 *   - validation issues (spelled out)
 */
export function UnitDetailPopover({
  code,
  yearIndex,
  slotIndex,
  children,
}: {
  code: string;
  yearIndex: number;
  slotIndex: number;
  children: React.ReactNode;
}) {
  const { units, offerings, requisites, validations, state } = usePlanner();
  const unit = units.get(code);
  const unitOfferings = offerings.get(code) ?? [];
  const unitReqs = requisites.get(code) ?? [];
  const validation = validations.get(keyFor(yearIndex, slotIndex, code));

  const completed = collectCompletedBefore(state, yearIndex, slotIndex);

  return (
    <Popover>
      <PopoverTrigger render={children as React.ReactElement} />
      <PopoverContent
        align="start"
        side="right"
        sideOffset={8}
        collisionPadding={16}
        initialFocus={false}
        finalFocus={false}
        className="w-[min(520px,calc(100vw-2rem))] max-h-[min(70svh,520px)] overflow-y-auto p-4"
      >
        <header className="flex flex-col gap-1 border-b pb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold tabular-nums">
              {code}
            </span>
            {unit ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                {unit.creditPoints}cp
              </span>
            ) : null}
          </div>
          <h3 className="text-sm font-medium leading-snug">
            {unit?.title ?? "Loading…"}
          </h3>
          {unit?.level || unit?.school ? (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {unit?.level ? <Badge variant="secondary" className="text-[10px]">{unit.level}</Badge> : null}
              {unit?.school ? (
                <Badge variant="outline" className="text-[10px] font-normal">
                  {unit.school}
                </Badge>
              ) : null}
            </div>
          ) : null}
        </header>

        {validation && (validation.errors.length > 0 || validation.warnings.length > 0) ? (
          <section className="border-b pt-2 pb-4">
            <h4 className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Issues in this slot
            </h4>
            <ul className="flex flex-col gap-1.5">
              {validation.errors.map((issue, i) => (
                <li
                  key={`err-${i}`}
                  className="flex gap-2 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
                >
                  <InfoIcon className="size-3.5 mt-0.5 shrink-0" />
                  <span>{issue.message}</span>
                </li>
              ))}
              {validation.warnings.map((issue, i) => (
                <li
                  key={`warn-${i}`}
                  className="flex gap-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400"
                >
                  <InfoIcon className="size-3.5 mt-0.5 shrink-0" />
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {unit?.synopsis ? (
          <section className="border-b pt-2 pb-4">
            <h4 className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              About
            </h4>
            <div
              className="prose-sm text-xs leading-relaxed text-muted-foreground [&_p]:mb-2 [&_p]:mt-0 [&_p:last-child]:mb-0 [&_br]:hidden [&_p:empty]:hidden [&_a]:text-primary [&_a]:underline line-clamp-6"
              dangerouslySetInnerHTML={{ __html: unit.synopsis }}
            />
          </section>
        ) : null}

        <section className="border-b pt-2 pb-4">
          <h4 className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Offered in {unit?.year ?? "2026"}
          </h4>
          {unitOfferings.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No offerings listed.
            </p>
          ) : (
            <OfferingsGrid offerings={unitOfferings} />
          )}
        </section>

        {unitReqs.length > 0 ? (
          <section className="pt-2">
            {unitReqs
              .filter((r) => r.rule && r.rule.length > 0)
              .map((block, i) => (
                <RequisiteBlockView key={i} block={block} completed={completed} />
              ))}
          </section>
        ) : null}

        <footer className="mt-4 flex items-center justify-end">
          <a
            href={`https://handbook.monash.edu/${unit?.year ?? "2026"}/units/${code}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLinkIcon className="size-3" />
            Handbook
          </a>
        </footer>
      </PopoverContent>
    </Popover>
  );
}

function OfferingsGrid({ offerings }: { offerings: PlannerOffering[] }) {
  // Group by period-kind so a student sees "S1: Clayton, Malaysia · S2: Clayton"
  const grouped = new Map<PeriodKind, { location: string; attendance: string | null }[]>();
  for (const o of offerings) {
    const list = grouped.get(o.periodKind) ?? [];
    list.push({ location: o.location ?? "—", attendance: o.attendanceModeCode });
    grouped.set(o.periodKind, list);
  }

  const ordered: PeriodKind[] = ["S1", "S2", "SUMMER_A", "SUMMER_B", "WINTER", "FULL_YEAR", "OTHER"];
  return (
    <ul className="flex flex-col gap-1.5 text-xs">
      {ordered
        .filter((k) => grouped.has(k))
        .map((k) => (
          <li key={k} className="flex items-baseline gap-2">
            <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
              {PERIOD_KIND_LABEL[k]}
            </span>
            <span className="flex flex-wrap gap-1">
              {grouped.get(k)!.map((o, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="text-[10px] font-normal"
                >
                  {o.location}
                  {o.attendance ? <span className="ml-1 text-muted-foreground">· {o.attendance}</span> : null}
                </Badge>
              ))}
            </span>
          </li>
        ))}
    </ul>
  );
}

function RequisiteBlockView({
  block,
  completed,
}: {
  block: RequisiteBlock;
  completed: ReadonlySet<string>;
}) {
  const label = block.requisiteType[0].toUpperCase() + block.requisiteType.slice(1) + "s";
  return (
    <div className="mb-3 last:mb-0">
      <h4 className={cn(
        "mb-1.5 text-[10px] uppercase tracking-wide",
        block.requisiteType === "prohibition" ? "text-destructive" : "text-muted-foreground",
      )}>
        {label}
      </h4>
      <RequisiteTreeView rule={block.rule} completed={completed} isProhibition={block.requisiteType === "prohibition"} />
    </div>
  );
}

function collectCompletedBefore(
  state: ReturnType<typeof usePlanner>["state"],
  yearIndex: number,
  slotIndex: number,
): Set<string> {
  const out = new Set<string>();
  for (let y = 0; y <= yearIndex; y++) {
    const year = state.years[y];
    for (let s = 0; s < year.slots.length; s++) {
      if (y === yearIndex && s >= slotIndex) break;
      for (const c of year.slots[s].unitCodes) out.add(c);
    }
  }
  return out;
}
