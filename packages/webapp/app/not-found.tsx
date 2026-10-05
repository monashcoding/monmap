import Link from "next/link"

import { PageShell } from "@/components/page-shell"
import { buttonVariants } from "@/components/ui/button"

export const metadata = {
  title: "Page not found",
}

export default function NotFound() {
  return (
    <PageShell>
      <section className="flex flex-1 flex-col items-center justify-center gap-6 rounded-panel border bg-card px-6 py-20 text-center shadow-card sm:py-28">
        <div className="flex flex-col items-center gap-2">
          <p className="text-6xl font-extrabold tracking-tight sm:text-7xl">
            404
          </p>
          <p className="text-lg text-muted-foreground sm:text-xl">
            Page not found.
          </p>
        </div>
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          Back to planner
        </Link>
      </section>
    </PageShell>
  )
}
