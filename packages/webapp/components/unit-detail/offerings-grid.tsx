import { Badge } from "@/components/ui/badge"
import {
  PERIOD_KIND_LABEL,
  PERIOD_KIND_ORDER,
} from "@/lib/planner/teaching-period"
import type { PeriodKind, PlannerOffering } from "@/lib/planner/types"
import { cn } from "@/lib/utils"

/**
 * A unit's offerings grouped by period, so a student sees
 * "S1: Clayton, Malaysia · S2: Clayton". `labelClassName` sets the
 * width of the period column, which differs between the panels.
 */
export function OfferingsGrid({
  offerings,
  labelClassName,
}: {
  offerings: PlannerOffering[]
  labelClassName?: string
}) {
  const grouped = new Map<
    PeriodKind,
    { location: string; attendance: string | null }[]
  >()
  for (const o of offerings) {
    const list = grouped.get(o.periodKind) ?? []
    list.push({ location: o.location ?? "-", attendance: o.attendanceModeCode })
    grouped.set(o.periodKind, list)
  }
  return (
    <ul className="flex flex-col gap-1.5 text-xs">
      {PERIOD_KIND_ORDER.filter((k) => grouped.has(k)).map((k) => (
        <li key={k} className="flex items-baseline gap-2">
          <span
            className={cn(
              "shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase",
              labelClassName
            )}
          >
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
                    - {o.attendance}
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
