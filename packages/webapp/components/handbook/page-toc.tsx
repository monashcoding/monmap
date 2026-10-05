"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

export interface TocItem {
  id: string
  label: string
}

/**
 * The id of the section being read: the last one whose top has passed
 * the line just below the sticky header. After a click, `pin` keeps the
 * clicked section active while the page jumps, even when the jump ends
 * at the bottom on a later section.
 */
function useActiveSection(items: TocItem[]) {
  const [active, setActive] = useState(items[0]?.id ?? null)
  const pinnedUntil = useRef(0)

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      if (Date.now() < pinnedUntil.current) return
      const sections = items
        .map((i) => document.getElementById(i.id))
        .filter((el): el is HTMLElement => el != null)
      if (sections.length === 0) return
      // At the very bottom the last sections can't reach the top of the
      // window, so the last one counts as read.
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4
      if (atBottom) {
        setActive(sections[sections.length - 1].id)
        return
      }
      let current = sections[0].id
      for (const el of sections) {
        if (el.getBoundingClientRect().top <= 120) current = el.id
        else break
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [items])

  const pin = (id: string) => {
    pinnedUntil.current = Date.now() + 800
    setActive(id)
  }
  return [active, pin] as const
}

/**
 * "On this page": links to the page's sections, with the section being
 * read highlighted. It sits in a sticky rail on wide screens.
 */
export function PageToc({ items }: { items: TocItem[] }) {
  const [active, pin] = useActiveSection(items)
  if (items.length < 2) return null
  return (
    <nav aria-label="On this page" className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        On this page
      </p>
      <ul className="flex flex-col border-l">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              aria-current={active === i.id ? "location" : undefined}
              onClick={() => pin(i.id)}
              className={cn(
                "-ml-px block border-l-2 py-1.5 pl-3 text-sm",
                active === i.id
                  ? "border-emphasis font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * The same links as a row of chips that sticks under the header, for
 * screens too narrow for the rail. The row scrolls sideways and keeps
 * the active chip in view.
 */
export function MobileToc({
  items,
  className,
}: {
  items: TocItem[]
  className?: string
}) {
  const [active, pin] = useActiveSection(items)
  const rowRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const row = rowRef.current
    const chip = row?.querySelector<HTMLElement>(`[data-toc="${active}"]`)
    if (!row || !chip) return
    // Scroll the row only, never the page.
    const left = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2
    row.scrollTo({ left, behavior: "smooth" })
  }, [active])

  if (items.length < 2) return null
  return (
    <nav
      aria-label="On this page"
      className={cn(
        "sticky top-14 z-30 -mx-3 border-b bg-background/95 backdrop-blur-xl sm:-mx-5 print:hidden",
        className
      )}
    >
      <ul
        ref={rowRef}
        className="flex gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none] sm:px-5 [&::-webkit-scrollbar]:hidden"
      >
        {items.map((i) => (
          <li key={i.id} className="shrink-0">
            <a
              href={`#${i.id}`}
              data-toc={i.id}
              aria-current={active === i.id ? "location" : undefined}
              onClick={() => pin(i.id)}
              className={cn(
                "flex h-8 items-center rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors",
                active === i.id
                  ? "border-foreground bg-foreground font-medium text-background"
                  : "bg-card text-muted-foreground"
              )}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
