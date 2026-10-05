"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

export interface TocItem {
  id: string
  label: string
}

/**
 * "On this page": links to the page's sections, with the section being
 * read highlighted. It sits in a sticky rail on wide screens and is
 * hidden on narrow ones, where the sections follow each other closely.
 */
export function PageToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? null)
  // After a click, the clicked section stays highlighted while the page
  // jumps, even when the jump ends at the bottom on a later section.
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
      // Otherwise: the last section whose top has passed the line just
      // below the sticky header.
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
              onClick={() => {
                pinnedUntil.current = Date.now() + 800
                setActive(i.id)
              }}
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
