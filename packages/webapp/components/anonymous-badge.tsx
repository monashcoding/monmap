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
 *
 * The header's room decides how much shows, so the bar never runs
 * past the window for a signed-out visitor:
 * - below md: a "Sign in" button;
 * - md to xl, where the tabs and links take the room: the Google "G"
 *   button alone;
 * - xl to 2xl: the yellow pill with the help icon and "Sign in with
 *   Google";
 * - 2xl and up: the pill with the "On this device only" note too.
 */
export function AnonymousBadge() {
  const { data, isPending } = useSession()
  if (isPending || data?.user) return null

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-1.5 rounded-control text-[var(--monash-yellow-ink)] selection:bg-[var(--monash-yellow-ink)] selection:text-[var(--monash-yellow)] xl:bg-[var(--monash-yellow)] xl:py-1 xl:pr-1 xl:pl-1.5 xl:shadow-sm 2xl:pl-3 print:hidden"
    >
      <span className="hidden text-[10px] leading-none font-medium whitespace-nowrap 2xl:inline">
        On this device only
      </span>
      <span className="sr-only 2xl:hidden">
        Your plan is saved in this browser only.
      </span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="What does this mean?"
                className="hidden size-4 items-center justify-center rounded-full text-[var(--monash-yellow-ink)]/70 hover:text-[var(--monash-yellow-ink)] focus-visible:ring-2 focus-visible:ring-[var(--monash-yellow-ink)] focus-visible:outline-none xl:inline-flex"
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
      <GoogleSignInButton
        size="sm"
        aria-label="Sign in with Google"
        className="h-8 px-2.5 text-xs md:size-8 md:px-0 xl:h-6 xl:w-auto xl:px-2 xl:text-[10px]"
        label={
          <>
            <span className="md:hidden">Sign in</span>
            <span className="hidden xl:inline">Sign in with Google</span>
          </>
        }
      />
    </div>
  )
}
