"use client"

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useRef } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useHydrated } from "@/hooks/use-hydrated"
import { cn } from "@/lib/utils"

const OPTIONS = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
] as const

/**
 * Light, dark and system as a row of buttons, for the mobile menu
 * sheet. It switches at once: the sheet covers the page, so the
 * circle reveal of `ThemeToggle` would not show.
 */
export function ThemeChoice() {
  const { theme, setTheme } = useTheme()
  const mounted = useHydrated()
  const current = mounted ? (theme ?? "system") : null
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid grid-cols-3 gap-1 rounded-control bg-muted p-1"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={current === value}
          onClick={() => setTheme(value)}
          className={cn(
            "flex h-10 items-center justify-center gap-1 rounded-tag text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            // In dark mode a card fill barely differs from the muted
            // track and the shadow does not show, so lighten it instead.
            current === value
              ? "bg-card font-medium text-foreground shadow-sm dark:bg-foreground/15"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  )
}

/** Header control for picking light, dark or the system theme. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const buttonRef = useRef<HTMLButtonElement>(null)

  /**
   * Switch themes with a circle that grows from the theme button and
   * uncovers the new theme. It uses the View Transitions API; without
   * it, or with reduced motion on, the theme changes at once.
   */
  function switchTheme(next: string) {
    const dark =
      next === "dark" ||
      (next === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    const button = buttonRef.current
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (
      !button ||
      reduce ||
      !document.startViewTransition ||
      dark === (resolvedTheme === "dark")
    ) {
      setTheme(next)
      return
    }
    const rect = button.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    // Far enough to cover the corner furthest from the button.
    const r = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )
    const root = document.documentElement
    root.classList.add("theme-switching")
    const transition = document.startViewTransition(() => {
      // Apply the class now so the new snapshot shows the new theme;
      // next-themes writes the same class and saves the choice.
      root.classList.toggle("dark", dark)
      root.style.colorScheme = dark ? "dark" : "light"
      setTheme(next)
    })
    void transition.ready.then(() => {
      root.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${r}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 550,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          pseudoElement: "::view-transition-new(root)",
        }
      )
    })
    void transition.finished.finally(() =>
      root.classList.remove("theme-switching")
    )
  }
  // The theme is only known on the client; render a neutral icon on
  // the server so hydration matches.
  const mounted = useHydrated()
  const Icon = !mounted
    ? SunIcon
    : resolvedTheme === "dark"
      ? MoonIcon
      : SunIcon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            ref={buttonRef}
            variant="ghost"
            size="icon-sm"
            aria-label="Change theme"
            className={cn("print:hidden", className)}
          />
        }
      >
        <Icon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuRadioGroup
          value={mounted ? (theme ?? "system") : "system"}
          onValueChange={(v) => switchTheme(String(v))}
        >
          {OPTIONS.map(({ value, label, Icon: ItemIcon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <ItemIcon className="size-4" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
