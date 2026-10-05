"use client"

import { ChevronDownIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

/**
 * Cuts long content short below md, with a "Show more" button. From md
 * up it shows everything and adds nothing. The content stays in the
 * HTML either way.
 */
export function MobileClamp({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || open) return
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [open])

  return (
    <div className="relative">
      <div
        ref={ref}
        className={cn(!open && "max-md:max-h-96 max-md:overflow-hidden")}
      >
        {children}
      </div>
      {!open && overflows ? (
        <div className="md:hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-11 h-20 bg-gradient-to-t from-card to-transparent"
          />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-3 flex h-8 items-center gap-1 text-sm font-medium text-info-foreground"
          >
            Show more
            <ChevronDownIcon className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  )
}
