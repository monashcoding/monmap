"use client"

import { HelpCircleIcon } from "lucide-react"

import { GoogleSignInButton } from "@/components/google-sign-in-button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useSession } from "@/lib/auth-client"

/**
 * Renders only when the visitor isn't signed in. Painted in Monash
 * brand yellow (`--monash-yellow` / `--monash-yellow-ink`) so it can
 * sit beside the avatar slot in `<AppHeader>` and replace the
 * standalone "Sign in with Google" button there.
 *
 * The `selection:` overrides flip the global ::selection rule (which
 * tints selections in yellow) so highlighted text remains readable
 * on top of a yellow surface.
 */
export function AnonymousBadge() {
  const { data, isPending } = useSession()
  if (isPending || data?.user) return null

  return (
    <div
      role="status"
      style={{
        backgroundColor: "var(--monash-yellow)",
        color: "var(--monash-yellow-ink)",
      }}
      className="flex items-center gap-1.5 rounded-full py-1 pr-1 pl-3 shadow-sm selection:bg-[var(--monash-yellow-ink)] selection:text-[var(--monash-yellow)] print:hidden"
    >
      <span className="text-[10px] font-medium leading-none whitespace-nowrap">
        On this device only
      </span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="What does this mean?"
                className="inline-flex size-4 items-center justify-center rounded-full text-[var(--monash-yellow-ink)]/70 hover:text-[var(--monash-yellow-ink)] focus-visible:ring-2 focus-visible:ring-[var(--monash-yellow-ink)] focus-visible:outline-none"
              >
                <HelpCircleIcon className="size-3.5" />
              </button>
            }
          />
          <TooltipContent side="bottom" className="max-w-[220px] text-center">
            Your plan is saved in this browser only. Sign in to sync across
            devices and keep multiple plans.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <GoogleSignInButton size="sm" className="h-6 px-2 text-[10px]" />
    </div>
  )
}
