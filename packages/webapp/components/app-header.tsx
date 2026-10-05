"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LogOutIcon, MenuIcon, NotebookPenIcon } from "lucide-react"
import { useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { AnonymousBadge } from "@/components/anonymous-badge"
import { HeaderLinks } from "@/components/header-links"
import { MyGradesDialog } from "@/components/my-grades-dialog"
import { PRIMARY_NAV_ITEMS, PrimaryNav } from "@/components/primary-nav"
import { ThemeToggle } from "@/components/theme-toggle"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import { cn } from "@/lib/utils"

/**
 * Site-wide top bar: a slim, sticky, full-width strip with the
 * MAC / MonMap breadcrumb, page tabs, the page's context slot, the
 * Feedback and Contribute links, the theme toggle and the avatar.
 *
 * Pages render it as the first child of their <main>. The bar pulls
 * itself out of <main>'s padding with negative margins, and its
 * backdrop (the ::before layer) spans the whole viewport so the strip
 * reads edge to edge even though <main> is capped at 1500px.
 *
 * Mobile (<md): hamburger, breadcrumb, context slot, avatar. Feedback,
 * Contribute and the theme toggle shrink to icons; the tabs move into
 * the sheet.
 */
export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 -mx-3 -mt-3 flex h-14 items-center gap-2 px-3 sm:-mx-5 sm:-mt-5 sm:gap-3 sm:px-5",
        "before:pointer-events-none before:absolute before:inset-y-0 before:left-1/2 before:-z-10 before:w-screen before:-translate-x-1/2 before:bg-card/90 before:shadow-[0_1px_0_var(--border),0_4px_12px_-6px_var(--shadow-tint)] before:backdrop-blur-md",
        "print:static print:mx-0 print:mt-0 print:before:hidden"
      )}
    >
      <MobileNavTrigger />
      {/* Brand bug — intentionally NOT an <h1>. Each route owns its own
          h1 (the unit/course title on canonical pages, "Start
          exploring" on the empty workbench, etc.) so Google sees a
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
          <span className="hidden rounded-tag bg-primary px-1.5 py-0.5 text-[10px] leading-none font-semibold text-primary-foreground sm:inline">
            2027 update!
          </span>
        </Link>
      </nav>
      <PrimaryNav className="ml-3 hidden md:flex" />
      <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
        {children ? (
          <div className="flex min-w-0 items-center gap-2">{children}</div>
        ) : null}
        <HeaderLinks />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  )
}

function MobileNavTrigger() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname() ?? "/"
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
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {PRIMARY_NAV_ITEMS.map(({ href, label, match }) => {
            const active = match(pathname)
            return (
              <Link
                key={href}
                href={href}
                prefetch
                onClick={() => setOpen(false)}
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
  const hydrated = useHydrated()

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

  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar>
            {user.image ? (
              <AvatarImage src={user.image} alt={user.name} />
            ) : null}
            <AvatarFallback>{initials || "?"}</AvatarFallback>
          </Avatar>
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
          <DropdownMenuItem onClick={() => setGradesOpen(true)}>
            <NotebookPenIcon className="size-3.5" />
            My grades
          </DropdownMenuItem>
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
