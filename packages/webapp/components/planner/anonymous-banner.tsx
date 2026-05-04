"use client"

import { GoogleSignInButton } from "@/components/google-sign-in-button"

import { usePlanner } from "./planner-context"

/**
 * Renders only when the visitor isn't signed in. Painted in Monash
 * brand yellow (`--monash-yellow` / `--monash-yellow-ink`) so it sits
 * naturally above the (purple) Course Progression Guide.
 *
 * The `selection:` overrides flip the global ::selection rule (which
 * tints selections in yellow) so highlighted text remains readable
 * on top of a yellow surface.
 */
export function AnonymousBanner() {
  const { currentUser } = usePlanner()
  if (currentUser) return null

  return (
    <div
      role="status"
      style={{
        backgroundColor: "var(--monash-yellow)",
        color: "var(--monash-yellow-ink)",
      }}
      className="flex flex-col gap-2 rounded-3xl px-4 py-3 shadow-card selection:bg-[var(--monash-yellow-ink)] selection:text-[var(--monash-yellow)] print:hidden"
    >
      <div className="space-y-1">
        <p className="text-[13px] font-medium leading-snug">
          Plan is on this device only.
        </p>
        <p className="text-[12px] leading-snug opacity-80">
          Sign in to sync across devices and keep multiple plans.
        </p>
      </div>
      <GoogleSignInButton size="sm" className="w-full" />
    </div>
  )
}
