"use client"

import { LoaderCircleIcon, SearchIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"

/**
 * The search field. Results update as you type (after a short pause)
 * by replacing the URL, so the server renders the results and every
 * search stays a shareable link. Enter on an exact code opens that
 * page directly.
 */
export function SearchBox({
  query,
  baseParams,
  exact,
}: {
  /** The query the page was rendered for. */
  query: string
  /** The other search params to keep (tab, year, filters), without q or page. */
  baseParams: string
  /** The page to open on Enter when the query is exactly one code. */
  exact: { code: string; href: string } | null
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(query)
  // The last query this box sent, so a page render for an older query
  // doesn't overwrite what the user has typed since.
  const [sent, setSent] = useState(query)
  const [renderedQuery, setRenderedQuery] = useState(query)
  const [pending, startTransition] = useTransition()

  if (query !== renderedQuery) {
    setRenderedQuery(query)
    // A navigation this box didn't make (back button, a tab link).
    if (query !== sent) {
      setValue(query)
      setSent(query)
    }
  }

  function go(q: string) {
    const sp = new URLSearchParams(baseParams)
    const trimmed = q.trim()
    if (trimmed) sp.set("q", trimmed)
    setSent(q)
    const qs = sp.toString()
    startTransition(() => {
      router.replace(qs ? `/search?${qs}` : "/search", { scroll: false })
    })
  }

  useEffect(() => {
    if (value === sent) return
    const timer = setTimeout(() => go(value), 250)
    return () => clearTimeout(timer)
    // `go` reads only stable values and props captured per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, sent])

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        if (exact && value.trim().toUpperCase() === exact.code) {
          router.push(exact.href)
          return
        }
        go(value)
      }}
      className="relative"
    >
      <label htmlFor="handbook-search" className="sr-only">
        Search units, courses and areas of study
      </label>
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        ref={inputRef}
        id="handbook-search"
        type="search"
        name="q"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder="Search by code, title or topic, e.g. FIT1045, data science, BCompSci"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-14 w-full rounded-panel border border-input bg-field pr-24 pl-12 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-2">
        {pending ? (
          <LoaderCircleIcon
            className="size-4 animate-spin text-muted-foreground"
            aria-label="Searching"
          />
        ) : null}
        {value ? (
          <button
            type="button"
            onClick={() => {
              setValue("")
              go("")
              inputRef.current?.focus()
            }}
            className="rounded-control p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
          >
            <XIcon className="size-4" />
          </button>
        ) : null}
      </div>
    </form>
  )
}
