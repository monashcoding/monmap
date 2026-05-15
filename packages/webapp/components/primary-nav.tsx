"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { cn } from "@/lib/utils"

export const PRIMARY_NAV_ITEMS = [
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
 * Inline horizontal nav, à la Bootstrap / BBC / Facebook. Sits next to
 * the brand inside the page header. Active item is bolded with a purple
 * underline; inactive items are muted with hover-to-foreground.
 *
 * On mobile the inline form is hidden — see the Sheet menu in
 * `<AppHeader>` which renders the same destinations as touch-sized rows.
 */
export function PrimaryNav({ className }: { className?: string }) {
  const pathname = usePathname() ?? "/"
  const router = useRouter()
  return (
    <nav className={cn("flex items-center gap-5 text-sm", className)}>
      {PRIMARY_NAV_ITEMS.map(({ href, label, match }) => {
        const active = match(pathname)
        return (
          <Link
            key={href}
            href={href}
            prefetch
            onMouseEnter={() => router.prefetch(href)}
            onFocus={() => router.prefetch(href)}
            onTouchStart={() => router.prefetch(href)}
            className={cn(
              "relative py-1 transition-colors",
              active
                ? "font-semibold text-[var(--monash-purple-deep)] after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-[var(--monash-purple)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
