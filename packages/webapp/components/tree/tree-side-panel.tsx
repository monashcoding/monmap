"use client"

import { ExternalLinkIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RequisiteTreeView } from "@/components/planner/requisite-tree-view"
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period"
import type {
  PeriodKind,
  PlannerOffering,
  RequisiteBlock,
  RequisiteRule,
} from "@/lib/planner/types"
import type { TreeNode } from "@/lib/tree/types"
import { cn } from "@/lib/utils"

export interface FocusedUnitDetail {
  node: TreeNode
  /** Codes equivalent to this one (excluding the canonical itself). */
  variants: string[]
  /** Offerings for the focused unit. */
  offerings: PlannerOffering[]
  /** Structured prereq/coreq/prohibition rules. */
  requisites: RequisiteBlock[]
  /** Free-text enrolment rules (course-locked, permission, cp gates). */
  enrolmentRules: Array<{
    ruleType: string | null
    description: string | null
  }>
  /** Codes the student already has in their plan (for ✓ marks). */
  completed: ReadonlySet<string>
}

/**
 * Right-side detail panel. Shows everything the structured graph hides:
 * AND/OR rule semantics, enrolment-rule prose, offerings, equivalent
 * codes. Deliberately mirrors the layout of the planner's
 * `UnitDetailPopover` so a student moving between Planner and Tree
 * sees the same information architecture.
 */
export function TreeSidePanel({
  detail,
  year,
  onClose,
}: {
  detail: FocusedUnitDetail | null
  year: string
  onClose: () => void
}) {
  if (!detail) return null
  const { node, variants, offerings, requisites, enrolmentRules, completed } =
    detail
  const unit = node.unit
  const filteredRules = requisites.filter((r) => r.rule && r.rule.length > 0)

  return (
    <aside className="flex h-full flex-col overflow-y-auto rounded-3xl border bg-card shadow-2xl ring-1 ring-border/60">
      <header className="sticky top-0 z-10 flex flex-col gap-1 border-b bg-card px-4 pt-4 pb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold tabular-nums">{node.code}</span>
          {unit ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {unit.creditPoints}cp
            </span>
          ) : null}
          <a
            href={`https://handbook.monash.edu/${year}/units/${node.code}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLinkIcon className="size-3" />
            Handbook
          </a>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label="Close detail panel"
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
        <h3 className="text-sm leading-snug font-medium">
          {unit?.title ?? (
            <span className="text-muted-foreground italic">
              Not offered in {year}
            </span>
          )}
        </h3>
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          {unit?.level ? (
            <Badge variant="secondary" className="text-[10px]">
              {unit.level}
            </Badge>
          ) : null}
          {node.periodBadge ? (
            <Badge variant="outline" className="text-[10px] font-normal">
              {node.periodBadge}
            </Badge>
          ) : null}
          {node.planStatus === "completed" ? (
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-[10px] font-normal text-emerald-700 dark:text-emerald-400"
            >
              In your plan
            </Badge>
          ) : null}
          {node.planStatus === "placed" ? (
            <Badge
              variant="outline"
              className="border-[var(--monash-purple)]/60 bg-[var(--monash-purple-soft)] text-[10px] font-normal text-[var(--monash-purple-deep)]"
            >
              Planned
            </Badge>
          ) : null}
        </div>
      </header>

      {variants.length > 0 ? (
        <section className="border-b px-4 pt-3 pb-4">
          <h4 className="mb-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
            Equivalent units
          </h4>
          <div className="flex flex-wrap gap-1">
            {variants.map((v) => (
              <Badge
                key={v}
                variant="secondary"
                className="text-[10px] tabular-nums"
              >
                {v}
              </Badge>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Take any one of these to satisfy this prereq.
          </p>
        </section>
      ) : null}

      {unit?.synopsis ? (
        <section className="border-b px-4 pt-3 pb-4">
          <h4 className="mb-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
            About
          </h4>
          <div
            className="prose-sm line-clamp-6 text-xs leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_br]:hidden [&_p]:mt-0 [&_p]:mb-2 [&_p:empty]:hidden [&_p:last-child]:mb-0"
            dangerouslySetInnerHTML={{ __html: unit.synopsis }}
          />
        </section>
      ) : null}

      <section className="border-b px-4 pt-3 pb-4">
        <h4 className="mb-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
          Offered in {year}
        </h4>
        {offerings.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No offerings listed.
          </p>
        ) : (
          <OfferingsGrid offerings={offerings} />
        )}
      </section>

      {filteredRules.length > 0 ? (
        <section className="border-b px-4 pt-3 pb-4">
          {filteredRules.map((block, i) => (
            <RuleBlock key={i} block={block} completed={completed} />
          ))}
        </section>
      ) : null}

      {enrolmentRules.length > 0 ? (
        <section className="px-4 pt-3 pb-4">
          <h4 className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            <span aria-hidden>🔒</span>
            Enrolment rules
          </h4>
          <div className="rounded-2xl bg-primary/40 px-3.5 py-3 text-primary-foreground">
            <ul className="flex flex-col gap-2 text-[12px] leading-relaxed">
              {enrolmentRules.map((er, i) => (
                <li
                  key={i}
                  className={cn(
                    "[&_a]:underline [&_a]:underline-offset-2 [&_br]:hidden [&_p]:mb-1 [&_p:last-child]:mb-0",
                    i > 0 && "border-t border-primary-foreground/15 pt-2"
                  )}
                  dangerouslySetInnerHTML={{ __html: er.description ?? "" }}
                />
              ))}
            </ul>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground italic">
            These gates aren&apos;t shown in the graph. Verify before adding to
            your plan.
          </p>
        </section>
      ) : null}
    </aside>
  )
}

function OfferingsGrid({ offerings }: { offerings: PlannerOffering[] }) {
  const grouped = new Map<
    PeriodKind,
    { location: string; attendance: string | null }[]
  >()
  for (const o of offerings) {
    const list = grouped.get(o.periodKind) ?? []
    list.push({ location: o.location ?? "—", attendance: o.attendanceModeCode })
    grouped.set(o.periodKind, list)
  }
  const ordered: PeriodKind[] = [
    "S1",
    "S2",
    "SUMMER_A",
    "SUMMER_B",
    "WINTER",
    "FULL_YEAR",
    "OTHER",
  ]
  return (
    <ul className="flex flex-col gap-1.5 text-xs">
      {ordered
        .filter((k) => grouped.has(k))
        .map((k) => (
          <li key={k} className="flex items-baseline gap-2">
            <span className="w-14 shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">
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
                  {o.attendance ? (
                    <span className="ml-1 text-muted-foreground">
                      · {o.attendance}
                    </span>
                  ) : null}
                </Badge>
              ))}
            </span>
          </li>
        ))}
    </ul>
  )
}

function RuleBlock({
  block,
  completed,
}: {
  block: { requisiteType: string; rule: RequisiteRule | null }
  completed: ReadonlySet<string>
}) {
  const label =
    block.requisiteType[0].toUpperCase() + block.requisiteType.slice(1) + "s"
  return (
    <div className="mb-3 last:mb-0">
      <h4
        className={cn(
          "mb-1.5 text-[10px] tracking-wide uppercase",
          block.requisiteType === "prohibition"
            ? "text-destructive"
            : "text-muted-foreground"
        )}
      >
        {label}
      </h4>
      <RequisiteTreeView
        rule={block.rule}
        completed={completed}
        isProhibition={block.requisiteType === "prohibition"}
      />
    </div>
  )
}
