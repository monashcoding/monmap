"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { cn } from "@/lib/utils"

type PrimaryNavItem = {
  href: string
  label: string
  match: (p: string) => boolean
}

export const PRIMARY_NAV_ITEMS: readonly PrimaryNavItem[] = [
  { href: "/", label: "Mapper", match: (p: string) => p === "/" },
  {
    href: "/plans",
    label: "My Course Maps",
    match: (p: string) => p.startsWith("/plans"),
  },
  {
    href: "/tree",
    label: "Unit Tree",
    match: (p: string) => p.startsWith("/tree"),
  },
] as const

/**
 * Inline tab nav in the top bar. The active tab sits on the accent
 * wash; inactive tabs are muted with hover-to-foreground.
 *
 * On mobile the inline form is hidden — see the Sheet menu in
 * `<AppHeader>` which renders the same destinations as touch-sized rows.
 */
export function PrimaryNav({ className }: { className?: string }) {
  const pathname = usePathname() ?? "/"
  const router = useRouter()
  return (
    <nav className={cn("flex items-center gap-1 text-sm", className)}>
      {PRIMARY_NAV_ITEMS.map(({ href, label, match }) => {
        const active = match(pathname)
        return (
          <Link
            key={href}
            href={href}
            prefetch
            aria-current={active ? "page" : undefined}
            onMouseEnter={() => router.prefetch(href)}
            onFocus={() => router.prefetch(href)}
            onTouchStart={() => router.prefetch(href)}
            className={cn(
              "rounded-control px-3 py-1.5 transition-colors",
              active
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
