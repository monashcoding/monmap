"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LogOutIcon,
  MenuIcon,
  MessageSquareTextIcon,
  NotebookPenIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { isReviewAdminAction } from "@/app/review-actions"
import { AnonymousBadge } from "@/components/anonymous-badge"
import { HEADER_LINKS, HeaderLinks } from "@/components/header-links"
import { MyGradesDialog } from "@/components/my-grades-dialog"
import { PRIMARY_NAV_ITEMS, PrimaryNav } from "@/components/primary-nav"
import { ReviewAvatar } from "@/components/reviews/review-avatar"
import { ThemeChoice, ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { signOut, useSession } from "@/lib/auth-client"
import { reviewInitials } from "@/lib/reviews/initials"
import { cn } from "@/lib/utils"

/**
 * Site-wide top bar: a slim, sticky, full-width strip with the
 * MAC / MonMap breadcrumb, page tabs, the page's context slot, the
 * Feedback and Contribute links, the theme toggle and the avatar.
 *
 * Pages render it as the first child of their <main>. The bar spans
 * the whole viewport so the strip reads edge to edge even though
 * <main> is capped at 1500px.
 *
 * Mobile (<md): hamburger, breadcrumb, context slot, avatar. The tabs,
 * the outside links, the theme choice and the "Review your units" link
 * move into the menu sheet.
 */
export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header
      className={cn(
        // Full-bleed: the margins pull the bar out to the viewport edges
        // and the padding puts its content back on <main>'s content edge.
        // The blur sits on the header itself, not on a pseudo-element
        // behind it — some browsers don't blur through a negative
        // z-index layer.
        "sticky top-0 z-40 mx-[calc(50%_-_50vw)] -mt-3 flex h-14 items-center gap-2 px-[calc(50vw_-_50%)] sm:-mt-5 sm:gap-3",
        "bg-card/95 shadow-[0_1px_0_var(--border),0_4px_12px_-6px_var(--shadow-tint)] backdrop-blur-xl backdrop-saturate-150",
        "print:static print:mx-0 print:mt-0 print:bg-transparent print:px-0 print:shadow-none"
      )}
    >
      <MobileNavTrigger />
      {/* Brand bug — intentionally NOT an <h1>. Each route owns its own
          h1 (the unit or course title on handbook pages, "Search
          units & courses" on /search, etc.) so Google sees a
          unique main topic per URL instead of "MonMap" repeated across
          every page. */}
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 shrink-0 items-center gap-2 text-sm"
      >
        <a
          href="https://monashcoding.com"
          target="_blank"
          rel="noopener noreferrer"
          title="Monash Association of Coding"
          className="group/mac flex items-center gap-2 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary">
            <Image
              src="/brand-logo.png"
              alt="Monash Association of Coding"
              width={28}
              height={28}
              priority
              className="size-full object-cover"
            />
          </span>
          <span className="hidden text-muted-foreground transition-colors group-hover/mac:text-foreground sm:inline">
            MAC
          </span>
        </a>
        <span aria-hidden className="hidden text-border sm:inline">
          /
        </span>
        <Link
          href="/"
          className="flex items-center gap-2 rounded-control font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          MonMap
        </Link>
        {/* One yellow pill: the 2027 note and a link to start reviewing.
            It sits beside the MonMap link, not in it, so the two links
            don't nest. */}
        <span className="hidden flex-col items-stretch rounded-tag bg-primary text-center text-[10px] leading-none font-semibold text-primary-foreground sm:inline-flex">
          <span className="px-1.5 pt-1 pb-0.5">2027 update</span>
          <span aria-hidden className="mx-1.5 h-px bg-primary-foreground/25" />
          <Link
            href="/my-reviews"
            className="rounded-tag px-1.5 pt-0.5 pb-1 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Review your units
          </Link>
        </span>
      </nav>
      <PrimaryNav className="ml-3 hidden md:flex" />
      <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
        {children ? (
          <div className="flex min-w-0 items-center gap-2">{children}</div>
        ) : null}
        <HeaderLinks className="hidden md:flex" />
        <ThemeToggle className="hidden md:inline-flex" />
        <UserMenu />
      </div>
    </header>
  )
}

function MobileNavTrigger() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname() ?? "/"
  const close = () => setOpen(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open navigation menu"
            className="md:hidden"
          />
        }
      >
        <MenuIcon className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(280px,80vw)] gap-0 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>MonMap</SheetTitle>
          <SheetDescription>Monash course planner</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <nav aria-label="Pages" className="flex flex-col gap-1">
            {PRIMARY_NAV_ITEMS.map(({ href, label, match }) => {
              const active = match(pathname)
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch
                  aria-current={active ? "page" : undefined}
                  onClick={close}
                  className={cn(
                    "flex h-12 items-center gap-3 rounded-control px-3 text-base transition-colors",
                    active
                      ? "bg-accent font-semibold text-accent-foreground"
                      : "text-foreground/80 hover:bg-accent/60"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 rounded-full",
                      active ? "bg-primary" : "bg-muted-foreground/40"
                    )}
                  />
                  {label}
                </Link>
              )
            })}
          </nav>
          <Link
            href="/my-reviews"
            onClick={close}
            className="flex items-center gap-3 rounded-control bg-primary/40 px-3 py-2.5 text-primary-foreground"
          >
            <MessageSquareTextIcon className="size-4 shrink-0" />
            <span className="flex flex-col">
              <span className="text-sm font-semibold">Review your units</span>
              <span className="text-xs">New in the 2027 update</span>
            </span>
          </Link>
          <section className="flex flex-col gap-2">
            <h2 className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Theme
            </h2>
            <ThemeChoice />
          </section>
          <section className="flex flex-col gap-1">
            <h2 className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Links
            </h2>
            {HEADER_LINKS.map(({ href, label, title, Icon }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={title}
                className="flex h-11 items-center gap-3 rounded-control px-3 text-sm text-foreground/80 transition-colors hover:bg-accent/60"
              >
                <Icon className="size-4 text-muted-foreground" />
                {label}
              </a>
            ))}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

const subscribeToNothing = () => () => {}

/**
 * False during SSR and on the hydrating render, true forever after.
 *
 * `getServerSnapshot` (the third argument) is what React uses both on
 * the server and while hydrating on the client, so this reports false
 * on exactly the renders that must agree with the server HTML, with no
 * effect and no extra render pass.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  )
}

function UserMenu() {
  const { data, isPending } = useSession()
  const router = useRouter()
  const [gradesOpen, setGradesOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const hydrated = useHydrated()
  const userId = data?.user?.id

  // Only admins see the moderation link. The server decides; the page
  // itself 404s for everyone else.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void isReviewAdminAction().then((ok) => {
      if (!cancelled) setIsAdmin(ok)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  // Hold the skeleton until after hydration, even if the session has
  // already resolved. Better Auth's `useStore` passes its *live client*
  // getter as `useSyncExternalStore`'s `getServerSnapshot`, so React
  // reads current atom state while hydrating rather than a frozen
  // server value. The session request resolves fast when it fails —
  // which it always does on localhost, where the shared
  // `.monashcoding.com` cookie doesn't exist — so it routinely beat
  // hydration of this page and React found the badge where the server
  // had written the skeleton. Gating on `hydrated` makes the first
  // client render match the server unconditionally.
  if (!hydrated || isPending) {
    return <div className="size-8 animate-pulse rounded-full bg-muted" />
  }

  const user = data?.user
  if (!user) {
    return <AnonymousBadge />
  }

  // What reviews show instead of the name (lib/reviews/initials).
  const reviewAs = reviewInitials(user.name, user.email)

  return (
    <>
      <DropdownMenu>
        {/* The same generated avatar reviews show, so the student sees
            how they appear to others. */}
        <DropdownMenuTrigger
          aria-label={`Account menu for ${user.name}`}
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ReviewAvatar initials={reviewAs} size={32} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal text-foreground">
              <div className="flex flex-col">
                <span className="text-sm font-medium whitespace-nowrap">
                  {user.name}
                </span>
                <span className="text-[11px]">{user.email}</span>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => router.push("/my-reviews")}
            className="items-start"
          >
            <MessageSquareTextIcon className="mt-0.5 size-3.5" />
            <span className="flex flex-col gap-0.5">
              <span>My reviews</span>
              <span className="max-w-52 text-[11px] leading-snug font-normal text-muted-foreground">
                You review as{" "}
                <span className="font-semibold text-foreground">
                  {reviewAs}
                </span>
                . Others see these initials, never your name or photo.
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setGradesOpen(true)}>
            <NotebookPenIcon className="size-3.5" />
            My grades
          </DropdownMenuItem>
          {isAdmin ? (
            <DropdownMenuItem onClick={() => router.push("/admin/reviews")}>
              <ShieldCheckIcon className="size-3.5" />
              Review moderation
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={async () => {
              const { error } = await signOut()
              if (error) {
                // e.g. the auth service rejecting this origin. Say so
                // instead of leaving the student signed in silently.
                toast.error("Couldn't sign out", {
                  description: error.message ?? "Try again in a moment.",
                })
                return
              }
              router.refresh()
            }}
          >
            <LogOutIcon className="size-3.5" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MyGradesDialog open={gradesOpen} onOpenChange={setGradesOpen} />
    </>
  )
}
