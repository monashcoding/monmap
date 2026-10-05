"use client"

import { StarIcon } from "lucide-react"
import { useRef, useState } from "react"

import { cn } from "@/lib/utils"

/**
 * Pick 1-5 stars. A radio group: Tab reaches the group, the arrow keys
 * move between stars, and each star is announced as "3 stars".
 * Hovering previews the rating.
 */
export function StarInput({
  value,
  onChange,
  label,
  size = "md",
  describedBy,
}: {
  value: number | null
  onChange: (v: number) => void
  label: string
  size?: "md" | "lg"
  describedBy?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const shown = hover ?? value ?? 0
  // The checked star takes Tab focus; with none checked, the first does.
  const focusable = value ?? 1

  const move = (to: number) => {
    const v = Math.max(1, Math.min(5, to))
    onChange(v)
    refs.current[v - 1]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      // Below md each star is a 44px touch target. The negative margin
      // keeps the first star in line with the label above it.
      className={cn(
        "inline-flex",
        size === "lg" ? "max-md:-ml-0.5" : "max-md:-ml-1.5"
      )}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          ref={(el) => {
            refs.current[n - 1] = el
          }}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
          tabIndex={n === focusable ? 0 : -1}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault()
              move((value ?? 0) + 1)
            } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault()
              move((value ?? 2) - 1)
            } else if (e.key === "Home") {
              e.preventDefault()
              move(1)
            } else if (e.key === "End") {
              e.preventDefault()
              move(5)
            }
          }}
          className={cn(
            "rounded-tag outline-none focus-visible:ring-2 focus-visible:ring-ring",
            size === "lg" ? "p-1 max-md:p-1.5" : "p-0.5 max-md:p-2"
          )}
        >
          <StarIcon
            aria-hidden
            strokeWidth={1.5}
            className={cn(
              size === "lg" ? "size-8" : "size-5 max-md:size-7",
              "transition-colors",
              n <= shown ? "fill-star text-star" : "fill-muted text-border"
            )}
          />
        </button>
      ))}
    </div>
  )
}

/**
 * Pick one of five labelled points, for axes such as difficulty where
 * neither end is "better".
 */
export function ScaleInput({
  value,
  onChange,
  label,
  steps,
  describedBy,
}: {
  value: number | null
  onChange: (v: number | null) => void
  label: string
  steps: readonly string[]
  describedBy?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const focusable = value ?? 1
  const move = (to: number) => {
    const v = Math.max(1, Math.min(5, to))
    onChange(v)
    refs.current[v - 1]?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      className="grid w-full max-w-md grid-cols-5 gap-1"
    >
      {steps.map((step, i) => {
        const n = i + 1
        const on = value === n
        return (
          <button
            key={step}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={n === focusable ? 0 : -1}
            // A second click on the chosen point clears it: the axis is
            // optional.
            onClick={() => onChange(on ? null : n)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault()
                move((value ?? 0) + 1)
              } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                e.preventDefault()
                move((value ?? 2) - 1)
              }
            }}
            className={cn(
              "min-h-9 rounded-tag border px-1 py-1.5 text-[11px] leading-tight transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:min-h-11",
              on
                ? "border-transparent bg-primary font-semibold text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {step}
          </button>
        )
      })}
    </div>
  )
}
