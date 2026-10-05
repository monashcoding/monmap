"use client"

import { usePathname } from "next/navigation"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"
import * as React from "react"

/**
 * Light and dark themes, following the operating system until the
 * student picks one in the header. next-themes writes `.dark` on
 * <html> before first paint, so there is no flash of the wrong theme.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ThemeColorSync />
      {children}
    </NextThemesProvider>
  )
}

/**
 * Make the phone's status bar follow the chosen theme, not only the
 * OS scheme. The root layout renders one theme-color tag per scheme,
 * each behind a `prefers-color-scheme` media query. This turns on the
 * tag for the resolved theme and turns off the other, so the colours
 * stay defined in one place (the layout's `viewport` export). It runs
 * again after each navigation in case Next.js rendered the tags anew.
 */
function ThemeColorSync() {
  const { resolvedTheme } = useTheme()
  const pathname = usePathname()
  React.useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return
    const tags = document.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]'
    )
    for (const tag of tags) {
      // Remember which scheme the tag was written for before its media
      // query is replaced.
      tag.dataset.scheme ??= tag.media.includes("dark") ? "dark" : "light"
      tag.media = tag.dataset.scheme === resolvedTheme ? "all" : "not all"
    }
  }, [resolvedTheme, pathname])
  return null
}
