"use client"

import { analytics } from "@/lib/analytics"
import { cn } from "@/lib/utils"
import { authClient } from "@/lib/auth-client"

import { GoogleIcon } from "./icons/google"

/**
 * Google brand-compliant sign-in button:
 * - white surface, "Roboto-ish" dark text, four-colour G mark
 * - matches the same shape language as our `Button` (rounded, hover
 *   subtly darkens), but cannot use it directly because the brand
 *   guidelines pin the surface to white regardless of theme
 *
 * Default action triggers `authClient.signIn("google", ...)` with
 * a configurable callback URL; pass `onClick` to override.
 */
export function GoogleSignInButton({
  callbackURL = "/",
  size = "default",
  className,
  label = "Sign in with Google",
  ...rest
}: Omit<React.ComponentProps<"button">, "type"> & {
  callbackURL?: string
  size?: "default" | "sm"
  label?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        rest.onClick?.(e)
        if (e.defaultPrevented) return
        analytics.capture("sign_in_initiated", {
          provider: "google",
          callback_url: callbackURL,
        })
        // The central service returns the browser here after login, so it
        // needs an absolute URL back into MonMap (a relative "/" would
        // resolve against the auth origin). Resolve against the current
        // origin, tolerating callers that already pass an absolute URL.
        const absoluteCallback = new URL(
          callbackURL,
          window.location.origin
        ).toString()
        // A failed request leaves the student on this page, as before.
        void authClient.signIn("google", absoluteCallback).catch(() => {})
      }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control border border-zinc-300 bg-white text-zinc-800 shadow-sm transition-colors",
        "hover:bg-zinc-50 active:bg-zinc-100",
        // Google's dark sign-in button colours.
        "dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:hover:bg-[#1f1f20] dark:active:bg-[#2a2a2b]",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm font-medium",
        className
      )}
      {...rest}
    >
      <GoogleIcon className={size === "sm" ? "size-4" : "size-[18px]"} />
      {label}
    </button>
  )
}
