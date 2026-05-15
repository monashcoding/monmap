import Link from "next/link"

import { AppHeader } from "@/components/app-header"
import { buttonVariants } from "@/components/ui/button"

export const metadata = {
  title: "Page not found",
}

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh max-w-[1500px] flex-col gap-3 px-3 pt-3 pb-12 sm:gap-5 sm:px-5 sm:pt-5">
      <AppHeader />
      <section className="flex flex-1 flex-col items-center justify-center gap-6 rounded-3xl border bg-card px-6 py-20 text-center shadow-card sm:py-28">
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
    </main>
  )
}
