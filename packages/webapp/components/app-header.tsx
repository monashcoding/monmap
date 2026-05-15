"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LogOutIcon, MenuIcon, NotebookPenIcon } from "lucide-react"
import { useState } from "react"

import { AnonymousBadge } from "@/components/anonymous-badge"
import { MyGradesDialog } from "@/components/my-grades-dialog"
import { PRIMARY_NAV_ITEMS, PrimaryNav } from "@/components/primary-nav"
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
 * Site-wide page header: brand block, page nav, and the avatar/sign-in
 * control. Self-contained — no per-page wiring required.
 *
 * Mobile (<md): brand + hamburger menu + avatar; the page-context
 * `children` slot wraps below if anything's there.
 * Desktop (md+): brand · inline nav · context slot · avatar.
 */
export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="relative flex flex-wrap items-center justify-between gap-2 overflow-hidden rounded-2xl border bg-card px-3 py-2.5 shadow-card sm:gap-3 sm:rounded-3xl sm:px-5 sm:py-3 print:border-none print:bg-transparent print:shadow-none">
      <div className="flex min-w-0 items-center gap-3 md:gap-6">
        <MobileNavTrigger />
        <Link href="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <div className="relative shrink-0">
            <div className="flex size-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground ring-2 ring-[var(--monash-purple)]/15 sm:size-10">
              <span aria-hidden className="text-lg leading-none sm:text-xl">
                🎓
              </span>
            </div>
            <span
              aria-hidden
              className="absolute -right-0.5 -bottom-0.5 block size-3 rounded-full bg-[var(--monash-purple)] ring-2 ring-card"
            />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base leading-tight font-semibold">
              monmap
            </h1>
            <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
              A course mapper by Monash Association of Coding (MAC)
            </p>
          </div>
        </Link>
        <PrimaryNav className="hidden md:flex" />
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {children ? (
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {children}
          </div>
        ) : null}
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
          <SheetTitle>monmap</SheetTitle>
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
                  "flex h-12 items-center gap-3 rounded-xl px-3 text-base transition-colors",
                  active
                    ? "bg-[var(--monash-purple-soft)] font-semibold text-[var(--monash-purple-deep)]"
                    : "text-foreground/80 hover:bg-muted/50"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    active
                      ? "bg-[var(--monash-purple)]"
                      : "bg-muted-foreground/40"
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

function UserMenu() {
  const { data, isPending } = useSession()
  const router = useRouter()
  const [gradesOpen, setGradesOpen] = useState(false)

  if (isPending) {
    return <div className="size-10 animate-pulse rounded-full bg-muted" />
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
          <Avatar size="lg">
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
              await signOut()
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
