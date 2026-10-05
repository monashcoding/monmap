import { rewriteHandbookHtml } from "@/lib/handbook/links"

/**
 * The "About" section of a unit detail panel: the handbook synopsis,
 * clamped to six lines, with handbook links pointed at MonMap pages
 * for `linkYear`. While the text loads it shows a few grey lines; a
 * unit without a synopsis shows nothing.
 */
export function UnitSynopsis({
  html,
  loading,
  linkYear,
  className,
}: {
  html: string | null | undefined
  loading: boolean
  linkYear: string | null
  className?: string
}) {
  if (!html && !loading) return null
  return (
    <section className={className}>
      <h4 className="mb-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
        About
      </h4>
      {html ? (
        <div
          className="prose-sm line-clamp-6 text-xs leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_br]:hidden [&_p]:mt-0 [&_p]:mb-2 [&_p:empty]:hidden [&_p:last-child]:mb-0"
          dangerouslySetInnerHTML={{
            __html: rewriteHandbookHtml(html, linkYear),
          }}
        />
      ) : (
        <div className="flex flex-col gap-2 py-1" role="status">
          <span className="sr-only">Loading the synopsis</span>
          <div className="h-3 w-full animate-pulse rounded-tag bg-muted" />
          <div className="h-3 w-11/12 animate-pulse rounded-tag bg-muted" />
          <div className="h-3 w-4/5 animate-pulse rounded-tag bg-muted" />
        </div>
      )}
    </section>
  )
}
