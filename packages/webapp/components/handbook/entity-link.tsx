"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef } from "react"

/**
 * A link for long lists of handbook pages. Next prefetches every link
 * that scrolls into view, and these pages are static, so a hub or a
 * course structure would download dozens of full pages the reader
 * never opens. This one prefetches only on hover, focus or touch, once.
 */
export function EntityLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: React.ReactNode
}) {
  const router = useRouter()
  // The href last prefetched: a row can keep its key while its link
  // changes, such as when the year changes.
  const done = useRef<string | null>(null)
  const prefetch = () => {
    if (done.current === href) return
    done.current = href
    router.prefetch(href)
  }
  return (
    <Link
      href={href}
      prefetch={false}
      className={className}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
    >
      {children}
    </Link>
  )
}
