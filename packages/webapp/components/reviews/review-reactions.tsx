"use client"

import { SmilePlusIcon } from "lucide-react"
import { useState } from "react"

import { GoogleSignInButton } from "@/components/google-sign-in-button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  REACTIONS,
  type ReactionId,
  type ReviewReactions,
} from "@/lib/reviews/reactions"
import { cn } from "@/lib/utils"

/**
 * Who is looking at the review:
 * - "member": signed in and not the author, so they can react;
 * - "anonymous": signed out, so reacting asks them to sign in;
 * - "author": their own review, so the counts are read-only.
 */
export type ReactionViewer = "member" | "anonymous" | "author"

/**
 * The reactions under a review, like Discord's: one chip per reaction
 * with a count, and a button that opens the fixed set of six.
 */
export function ReviewReactionsBar({
  reactions,
  viewer,
  signInUrl,
  onToggle,
}: {
  reactions: ReviewReactions
  viewer: ReactionViewer
  signInUrl: string
  onToggle: (r: ReactionId) => void
}) {
  const [open, setOpen] = useState(false)
  const shown = REACTIONS.filter((r) => (reactions.counts[r.id] ?? 0) > 0)
  const react = (id: ReactionId) => {
    if (viewer === "anonymous") {
      setOpen(true)
      return
    }
    setOpen(false)
    onToggle(id)
  }
  if (viewer === "author" && shown.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((r) => {
        const count = reactions.counts[r.id] ?? 0
        const mine = reactions.mine.includes(r.id)
        const label = `${r.label}: ${count}`
        const chip = cn(
          "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs tabular-nums max-md:h-9",
          mine
            ? "border-foreground/25 bg-muted font-semibold text-foreground"
            : "border-border bg-card text-muted-foreground"
        )
        return viewer === "author" ? (
          <span key={r.id} className={chip} title={label}>
            <span aria-hidden>{r.emoji}</span>
            <span className="sr-only">{r.label}</span>
            {count}
          </span>
        ) : (
          <button
            key={r.id}
            type="button"
            className={cn(chip, "hover:border-ring")}
            aria-pressed={mine}
            title={label}
            onClick={() => react(r.id)}
          >
            <span aria-hidden>{r.emoji}</span>
            <span className="sr-only">{r.label}</span>
            {count}
          </button>
        )
      })}
      {viewer === "author" ? null : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label="Add a reaction"
                title="Add a reaction"
                className="inline-flex h-7 items-center rounded-full border border-dashed px-2 text-muted-foreground hover:border-ring hover:text-foreground max-md:h-9"
              />
            }
          >
            <SmilePlusIcon className="size-3.5" aria-hidden />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2">
            {viewer === "anonymous" ? (
              <div className="flex max-w-60 flex-col gap-2 p-1">
                <p className="text-sm font-medium">Sign in to react</p>
                <p className="text-xs text-muted-foreground">
                  Other students only see the counts, never who reacted.
                </p>
                <GoogleSignInButton
                  size="sm"
                  callbackURL={signInUrl}
                  label="Sign in"
                />
              </div>
            ) : (
              <div className="flex gap-1" role="group" aria-label="Reactions">
                {REACTIONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    title={r.label}
                    aria-label={r.label}
                    aria-pressed={reactions.mine.includes(r.id)}
                    onClick={() => react(r.id)}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-control text-lg hover:bg-muted",
                      reactions.mine.includes(r.id) && "bg-muted"
                    )}
                  >
                    {r.emoji}
                  </button>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
