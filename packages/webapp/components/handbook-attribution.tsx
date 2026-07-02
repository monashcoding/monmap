/**
 * Legal-cover footer for any page that surfaces handbook-derived prose
 * (overview, synopsis). Two things, in priority order:
 *
 *   1. We are not Monash University. MonMap is a tool by the Monash
 *      Association of Coding (MAC), a student club.
 *   2. The text is sourced from Monash's public handbook; the
 *      authoritative entry lives at handbook.monash.edu.
 *
 * Rendered at the bottom of the /tree workbench so anyone reading the
 * entity facts panel sees the disclaimer alongside the
 * synopsis/overview.
 */
export function HandbookAttribution({ year }: { year: string }) {
  return (
    <aside className="rounded-3xl border border-dashed bg-muted/30 p-4 text-xs text-muted-foreground sm:p-5">
      <p>
        <strong className="font-semibold text-foreground">MonMap</strong> is a
        student-built course planning tool by the{" "}
        <a
          href="https://monashcoding.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          Monash Association of Coding
        </a>
        . It is{" "}
        <strong className="font-semibold">
          not affiliated with Monash University
        </strong>
        . Course and unit information is sourced from the public Monash
        University Handbook ({year}); for the authoritative entry refer to{" "}
        <a
          href="https://handbook.monash.edu/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          handbook.monash.edu
        </a>
        .
      </p>
    </aside>
  )
}
