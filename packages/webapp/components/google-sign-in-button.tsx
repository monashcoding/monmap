"use client"

import { cn } from "@/lib/utils"
import { signIn } from "@/lib/auth-client"

import { GoogleIcon } from "./icons/google"

/**
 * Google brand-compliant sign-in button:
 * - white surface, "Roboto-ish" dark text, four-colour G mark
 * - matches the same shape language as our `Button` (rounded, hover
 *   subtly darkens), but cannot use it directly because the brand
 *   guidelines pin the surface to white regardless of theme
 *
 * Default action triggers `signIn.social({ provider: "google" })` with
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
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        rest.onClick?.(e)
        if (e.defaultPrevented) return
        void signIn.social({ provider: "google", callbackURL })
      }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white text-zinc-800 shadow-sm transition-colors",
        "hover:bg-zinc-50 active:bg-zinc-100",
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
