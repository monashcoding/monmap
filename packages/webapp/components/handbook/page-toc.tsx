"use client"

import { useEffect, useState } from "react"

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

  useEffect(() => {
    const sections = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el != null)
    const visible = new Set<string>()
    // A section counts as read once its top passes the band just below
    // the sticky header; the first such section in page order wins.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id)
          else visible.delete(e.target.id)
        }
        const first = items.find((i) => visible.has(i.id))
        if (first) setActive(first.id)
      },
      { rootMargin: "-80px 0px -55% 0px" }
    )
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
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
              onClick={() => setActive(i.id)}
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
