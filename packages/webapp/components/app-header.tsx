import Link from "next/link"
import { GraduationCapIcon } from "lucide-react"

import { PrimaryNav } from "@/components/primary-nav"

/**
 * Site-wide page header: brand block + page nav + a free right slot
 * for page-specific actions (save status, user menu, "New plan", …).
 * The card chrome, brand, tagline, and nav live here so every page
 * inherits them by simply rendering <AppHeader rightSlot={…} />.
 */
export function AppHeader({ rightSlot }: { rightSlot?: React.ReactNode }) {
  return (
    <header className="relative flex items-center justify-between overflow-hidden rounded-3xl border bg-card px-5 py-3 shadow-card print:border-none print:bg-transparent print:shadow-none">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="relative">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground ring-2 ring-[var(--monash-purple)]/15">
              <GraduationCapIcon className="size-5" />
            </div>
            <span
              aria-hidden
              className="absolute -right-0.5 -bottom-0.5 block size-3 rounded-full bg-[var(--monash-purple)] ring-2 ring-card"
            />
          </div>
          <div>
            <h1 className="text-base leading-tight font-semibold">monmap</h1>
            <p className="text-[11px] text-muted-foreground">
              A course mapper by Monash Association of Coding (MAC)
            </p>
          </div>
        </Link>
        <PrimaryNav />
      </div>
      {rightSlot ? (
        <div className="flex items-center gap-3">{rightSlot}</div>
      ) : null}
    </header>
  )
}
