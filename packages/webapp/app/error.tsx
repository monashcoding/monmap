"use client"

import Link from "next/link"
import { useEffect } from "react"

import { PageShell } from "@/components/page-shell"
import { Button, buttonVariants } from "@/components/ui/button"

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <PageShell>
      <section className="flex flex-1 flex-col items-center justify-center gap-6 rounded-panel border bg-card px-6 py-20 text-center shadow-card sm:py-28">
        <div className="flex flex-col items-center gap-2">
          <p className="text-6xl font-extrabold tracking-tight sm:text-7xl">
            500
          </p>
          <p className="text-lg text-muted-foreground sm:text-xl">
            Something went wrong.
          </p>
          {error.digest ? (
            <p className="font-mono text-xs text-muted-foreground/70">
              ref - {error.digest}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" onClick={() => reset()}>
            Try again
          </Button>
          <Link
            href="/"
            className={buttonVariants({ size: "lg", variant: "outline" })}
          >
            Back to planner
          </Link>
        </div>
      </section>
    </PageShell>
  )
}
