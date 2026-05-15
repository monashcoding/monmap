"use client"

import Link from "next/link"
import { useEffect } from "react"

import { AppHeader } from "@/components/app-header"
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
    <main className="mx-auto flex min-h-svh max-w-[1500px] flex-col gap-3 px-3 pt-3 pb-12 sm:gap-5 sm:px-5 sm:pt-5">
      <AppHeader />
      <section className="flex flex-1 flex-col items-center justify-center gap-6 rounded-3xl border bg-card px-6 py-20 text-center shadow-card sm:py-28">
        <div className="flex flex-col items-center gap-2">
          <p className="text-6xl font-extrabold tracking-tight sm:text-7xl">
            500
          </p>
          <p className="text-lg text-muted-foreground sm:text-xl">
            Something went wrong.
          </p>
          {error.digest ? (
            <p className="font-mono text-xs text-muted-foreground/70">
              ref · {error.digest}
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
    </main>
  )
}
