"use client"

import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import {
  ArrowUpRightIcon,
  BriefcaseIcon,
  LayoutGridIcon,
  MapIcon,
  SparklesIcon,
  TicketIcon,
  TimerIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const MAC_SITE = "https://monashcoding.com"
const MEMBERSHIP_URL = "https://clubs.msa.monash.edu/organisation/7489/"

/** The same apps, in the same order, as the menu on monashcoding.com. */
const MAC_APPS = [
  {
    name: "MonMap",
    tagline: "Plan your degree",
    href: "https://monmap.monashcoding.com/",
    Icon: MapIcon,
    current: true,
  },
  {
    name: "Jobs",
    tagline: "Internships and grad roles",
    href: "https://jobs.monashcoding.com/",
    Icon: BriefcaseIcon,
  },
  {
    name: "MAC Study",
    tagline: "Study timer with friends",
    href: "https://study.monashcoding.com/",
    Icon: TimerIcon,
  },
  {
    name: "Member Pricing",
    tagline: "Cheaper event tickets",
    href: "https://verify.monashcoding.com/",
    Icon: TicketIcon,
  },
  {
    name: "Team Quiz",
    tagline: "Which MAC team are you?",
    href: "https://what-is-your-mac-team.monashcoding.com/",
    Icon: SparklesIcon,
  },
] as const

const linkItemClass =
  "flex cursor-default items-center gap-2.5 rounded-control px-2.5 py-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground"

/**
 * Header menu listing the other Monash Association of Coding apps, so
 * every monmap page points students at the club and its tools.
 */
export function MacAppsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="MAC apps"
            className="print:hidden"
          />
        }
      >
        <LayoutGridIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-2">
        <p className="px-2.5 pt-1 pb-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          MAC apps
        </p>
        {MAC_APPS.map((app) => {
          const current = "current" in app && app.current
          return (
            <MenuPrimitive.LinkItem
              key={app.name}
              href={current ? "/" : app.href}
              target={current ? undefined : "_blank"}
              rel={current ? undefined : "noopener noreferrer"}
              className={linkItemClass}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-control",
                  current
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                )}
              >
                <app.Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block leading-tight font-medium">
                  {app.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {current ? "You're here" : app.tagline}
                </span>
              </span>
            </MenuPrimitive.LinkItem>
          )
        })}
        <DropdownMenuSeparator className="my-2" />
        <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
          <MenuPrimitive.LinkItem
            href={MEMBERSHIP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-control bg-primary px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-primary-foreground uppercase outline-hidden focus:ring-2 focus:ring-ring"
          >
            Become a member
          </MenuPrimitive.LinkItem>
          <MenuPrimitive.LinkItem
            href={MAC_SITE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-control px-2 py-1.5 text-xs text-muted-foreground outline-hidden hover:text-foreground focus:bg-accent focus:text-accent-foreground"
          >
            monashcoding.com
            <ArrowUpRightIcon className="size-3" />
          </MenuPrimitive.LinkItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
