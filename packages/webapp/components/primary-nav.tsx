"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const items = [
  { href: "/", label: "Mapper", match: (p: string) => p === "/" },
  {
    href: "/plans",
    label: "My plans",
    match: (p: string) => p.startsWith("/plans"),
  },
]

/**
 * Inline horizontal nav, à la Bootstrap / BBC / Facebook. Sits next to
 * the brand inside the page header. Active item is bolded with a purple
 * underline; inactive items are muted with hover-to-foreground.
 */
export function PrimaryNav() {
  const pathname = usePathname() ?? "/"
  return (
    <nav className="flex items-center gap-5 text-sm">
      {items.map(({ href, label, match }) => {
        const active = match(pathname)
        return (
          <Link
            key={href}
            href={href}
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
