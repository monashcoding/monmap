import { RatingInline } from "@/components/reviews/stars"
import { entityHref, type EntityKind } from "@/lib/handbook/links"
import type { RatingSummary } from "@/lib/reviews/types"
import { cn } from "@/lib/utils"

import { EntityLink } from "./entity-link"
import { KindBadge } from "./frame"
import { loadRatings, ratingKey, type Ratings } from "./ratings"

/**
 * Lists of units, courses and areas of study, each row with its
 * rating. Each list loads its own ratings unless the page passes
 * `ratings` it loaded for all its lists at once.
 */

export interface EntityRowData {
  kind: EntityKind
  code: string
  title: string | null
  /** Right-hand note, such as "6 cp" or "Major". */
  note?: string | null
  /** False when MonMap has no page for the code. */
  linkable?: boolean
  /** Show the kind badge, for lists that mix units with other kinds. */
  showKind?: boolean
}

/** A compact list: code, title, rating and a note per row. */
export async function EntityRows({
  rows,
  linkYear,
  className,
  ratings,
}: {
  rows: EntityRowData[]
  linkYear: string | null
  className?: string
  ratings?: Ratings
}) {
  if (rows.length === 0) return null
  const loaded = ratings ?? (await loadRatings(rows))
  return (
    <ul
      className={cn("flex flex-col divide-y rounded-control border", className)}
    >
      {rows.map((r, i) => (
        <li key={`${r.kind}:${r.code}:${i}`}>
          <EntityRow
            row={r}
            linkYear={linkYear}
            rating={loaded.get(ratingKey(r.kind, r.code))}
          />
        </li>
      ))}
    </ul>
  )
}

function EntityRow({
  row,
  linkYear,
  rating,
}: {
  row: EntityRowData
  linkYear: string | null
  rating: RatingSummary | undefined
}) {
  const body = (
    <>
      <span className="min-w-[4.5rem] font-semibold whitespace-nowrap tabular-nums">
        {row.code}
      </span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        {row.showKind && row.kind !== "unit" ? (
          <KindBadge
            kind={row.kind}
            // A long code can leave a nested list on a phone too narrow
            // for the badge on one line.
            className="translate-y-[-1px] max-sm:max-w-full"
          />
        ) : null}
        <span className="text-foreground/80 underline-offset-2 group-hover:underline">
          {row.title ?? ""}
        </span>
      </span>
      {/* Below sm this sits under the title, where a nested list leaves
          it little width, so the rating and note may wrap. */}
      <span className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground sm:col-start-auto sm:flex-nowrap sm:justify-end sm:whitespace-nowrap">
        {row.linkable !== false ? (
          <RatingInline summary={rating} size="xs" />
        ) : null}
        {row.note ? <span>{row.note}</span> : null}
      </span>
    </>
  )
  const cls =
    // Below sm the rating and note drop under the title, so a long
    // title keeps the width it needs. The code column is never
    // narrower than the code.
    "grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm sm:grid-cols-[minmax(4.5rem,auto)_minmax(0,1fr)_auto] sm:gap-y-0"
  if (row.linkable === false) {
    return <div className={cls}>{body}</div>
  }
  return (
    <EntityLink
      href={entityHref(row.kind, row.code, linkYear)}
      className={cn(cls, "group hover:bg-muted/50")}
    >
      {body}
    </EntityLink>
  )
}

/**
 * Cards for a short list of courses or areas of study: the title
 * leads, the code and a note sit above it.
 */
export async function EntityCards({
  rows,
  linkYear,
  ratings,
}: {
  rows: EntityRowData[]
  linkYear: string | null
  ratings?: Ratings
}) {
  if (rows.length === 0) return null
  const loaded = ratings ?? (await loadRatings(rows))
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r, i) => (
        <li key={`${r.kind}:${r.code}:${i}`} className="flex">
          <EntityLink
            href={entityHref(r.kind, r.code, linkYear)}
            className="group flex w-full flex-col gap-1 rounded-control border px-3.5 py-3 hover:border-ring hover:bg-muted/30"
          >
            <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-semibold tabular-nums">{r.code}</span>
              {r.note ? <span>{r.note}</span> : null}
            </span>
            <span className="text-sm leading-snug font-medium underline-offset-2 group-hover:underline">
              {r.title ?? r.code}
            </span>
            <RatingInline
              summary={loaded.get(ratingKey(r.kind, r.code))}
              size="xs"
              className="mt-auto pt-1"
            />
          </EntityLink>
        </li>
      ))}
    </ul>
  )
}

/** Unit tiles in a grid: code over title, for requisite groups. */
export async function UnitTiles({
  units,
  linkYear,
  ratings,
}: {
  units: Array<{ code: string; title: string | null; linkable: boolean }>
  linkYear: string | null
  ratings?: Ratings
}) {
  const loaded =
    ratings ??
    (await loadRatings(units.map((u) => ({ kind: "unit", code: u.code }))))
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {units.map((u) => {
        const body = (
          <>
            <span className="text-sm font-semibold tabular-nums">{u.code}</span>
            <span className="text-sm leading-snug text-muted-foreground group-hover:text-foreground">
              {u.title ?? "No handbook page"}
            </span>
            {u.linkable ? (
              <RatingInline
                summary={loaded.get(ratingKey("unit", u.code))}
                size="xs"
                className="pt-0.5"
              />
            ) : null}
          </>
        )
        const cls =
          "flex h-full flex-col gap-0.5 rounded-control border bg-card px-3.5 py-2.5"
        return (
          <li key={u.code}>
            {u.linkable ? (
              <EntityLink
                href={entityHref("unit", u.code, linkYear)}
                className={cn(cls, "group hover:border-ring")}
              >
                {body}
              </EntityLink>
            ) : (
              <div className={cn(cls, "border-dashed")}>{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
