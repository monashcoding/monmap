"use client"

import { XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RatingInline } from "@/components/reviews/stars"
import { useRating } from "@/components/reviews/use-ratings"
import { OfferingsGrid } from "@/components/unit-detail/offerings-grid"
import {
  blocksWithRules,
  RequisiteRuleBlock,
} from "@/components/unit-detail/requisite-block"
import { UnitDetailHeader } from "@/components/unit-detail/unit-detail-header"
import { UnitSynopsis } from "@/components/unit-detail/unit-synopsis"
import { useUnitText } from "@/components/unit-detail/use-unit-text"
import { rewriteHandbookHtml } from "@/lib/handbook/links"
import type { FocusedUnitDetail } from "@/lib/tree/types"
import { cn } from "@/lib/utils"

/**
 * Right-side detail panel. Shows everything the structured graph hides:
 * AND/OR rule semantics, enrolment-rule prose, offerings, equivalent
 * codes. Built from the same pieces as the planner's `UnitDetailView`
 * (components/unit-detail), so a student moving between the planner
 * and a map sees the same information architecture.
 */
export function TreeSidePanel({
  detail,
  year,
  linkYear = null,
  onClose,
  variant = "floating",
  detailsHref,
}: {
  detail: FocusedUnitDetail | null
  year: string
  /** Year segment for handbook links in the unit's prose. */
  linkYear?: string | null
  onClose: () => void
  /** The unit's MonMap page; shows a "View details" link when set. */
  detailsHref?: string
  /** "floating": styled as a card (desktop side panel). "flush": no
   *  card chrome, fills its container (mobile bottom sheet). */
  variant?: "floating" | "flush"
}) {
  const rating = useRating("unit", detail?.node.code)
  // The synopsis is the focused unit's; the enrolment rules are the
  // union over its equivalents, like the offerings and rules.
  const codes = detail ? [detail.node.code, ...detail.variants] : []
  const { text, loading } = useUnitText(codes, detail ? year : null)
  if (!detail) return null
  const { node, variants, offerings, requisites, completed } = detail
  const unit = node.unit
  const filteredRules = blocksWithRules(requisites)
  const enrolmentRules = codes.flatMap((c) => text[c]?.enrolmentRules ?? [])

  return (
    <aside
      className={
        variant === "floating"
          ? "flex h-full flex-col overflow-y-auto rounded-panel border bg-card shadow-2xl ring-1 ring-border/60"
          : "flex h-full flex-col overflow-y-auto bg-card"
      }
    >
      <UnitDetailHeader
        code={node.code}
        href={detailsHref}
        creditPoints={unit?.creditPoints}
        title={unit?.title ?? null}
        fallback={
          <span className="text-muted-foreground italic">
            Not offered in {year}
          </span>
        }
        close={
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label="Close detail panel"
            className={cn("max-md:size-10", !detailsHref && "ml-auto")}
          >
            <XIcon className="size-3.5 max-md:size-4" />
          </Button>
        }
        className="sticky top-0 z-10 bg-card px-4 pt-4 pb-3"
      >
        {rating ? (
          <RatingInline summary={rating} size="xs" className="self-start" />
        ) : null}
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
              className="border-success/40 text-[10px] font-normal text-success-foreground"
            >
              In your plan
            </Badge>
          ) : null}
          {node.planStatus === "placed" ? (
            <Badge
              variant="outline"
              className="border-emphasis/60 bg-emphasis-soft text-[10px] font-normal text-emphasis"
            >
              Planned
            </Badge>
          ) : null}
        </div>
      </UnitDetailHeader>

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

      <UnitSynopsis
        html={text[node.code]?.synopsis}
        loading={loading && !!unit}
        linkYear={linkYear}
        className="border-b px-4 pt-3 pb-4"
      />

      <section className="border-b px-4 pt-3 pb-4">
        <h4 className="mb-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
          Offered in {year}
        </h4>
        {offerings.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No offerings listed.
          </p>
        ) : (
          <OfferingsGrid offerings={offerings} labelClassName="w-14" />
        )}
      </section>

      {filteredRules.length > 0 ? (
        <section className="border-b px-4 pt-3 pb-4">
          {filteredRules.map((block, i) => (
            <RequisiteRuleBlock key={i} block={block} completed={completed} />
          ))}
        </section>
      ) : null}

      {enrolmentRules.length > 0 ? (
        <section className="px-4 pt-3 pb-4">
          <h4 className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            <span aria-hidden>🔒</span>
            Enrolment rules
          </h4>
          <div className="rounded-control bg-primary/40 px-3.5 py-3 text-primary-foreground">
            <ul className="flex flex-col gap-2 text-[12px] leading-relaxed">
              {enrolmentRules.map((er, i) => (
                <li
                  key={i}
                  className={cn(
                    "[&_a]:underline [&_a]:underline-offset-2 [&_br]:hidden [&_p]:mb-1 [&_p:last-child]:mb-0",
                    i > 0 && "border-t border-primary-foreground/15 pt-2"
                  )}
                  dangerouslySetInnerHTML={{
                    __html: rewriteHandbookHtml(er.description, linkYear),
                  }}
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
