import Link from "next/link"
import { ExternalLinkIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The top of a unit detail panel: code, credit points and a "View
 * Details" link on one row, the title below, then `children` (rating,
 * badges). With no `href` the code and title are plain text and the
 * link is left out. `afterCode` sits after the credit points (the
 * planner's year picker); `close` ends the first row.
 */
export function UnitDetailHeader({
  code,
  href,
  creditPoints,
  title,
  fallback,
  codeClassName = "font-bold",
  afterCode,
  close,
  className,
  children,
}: {
  code: string
  href?: string
  creditPoints?: number
  title: string | null
  /** Shown in place of the title when the unit has none. */
  fallback: React.ReactNode
  codeClassName?: string
  afterCode?: React.ReactNode
  close?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <header className={cn("flex flex-col gap-1 border-b", className)}>
      <div className="flex items-baseline gap-2">
        {href ? (
          <Link
            href={href}
            className={cn(
              "text-base tabular-nums underline-offset-2 hover:underline",
              codeClassName
            )}
          >
            {code}
          </Link>
        ) : (
          <span className={cn("text-base tabular-nums", codeClassName)}>
            {code}
          </span>
        )}
        {creditPoints != null ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {creditPoints}cp
          </span>
        ) : null}
        {afterCode}
        {href ? (
          <Link
            href={href}
            className="ml-auto inline-flex items-center gap-1 text-xs text-info-foreground underline-offset-2 hover:underline max-md:h-10"
          >
            <ExternalLinkIcon className="size-3" />
            View Details
          </Link>
        ) : null}
        {close}
      </div>
      <h3 className="text-sm leading-snug font-medium">
        {title && href ? (
          <Link href={href} className="underline-offset-2 hover:underline">
            {title}
          </Link>
        ) : (
          (title ?? fallback)
        )}
      </h3>
      {children}
    </header>
  )
}
