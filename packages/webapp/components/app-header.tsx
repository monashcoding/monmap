"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { GraduationCapIcon, LogOutIcon } from "lucide-react"

import { AnonymousBadge } from "@/components/anonymous-badge"
import { PrimaryNav } from "@/components/primary-nav"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { signOut, useSession } from "@/lib/auth-client"

/**
 * Site-wide page header: brand block, page nav, and the avatar/sign-in
 * control. Self-contained — no per-page wiring required.
 */
export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="relative flex items-center justify-between overflow-hidden rounded-3xl border bg-card px-5 py-3 shadow-card print:border-none print:bg-transparent print:shadow-none">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="relative">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground ring-2 ring-[var(--monash-purple)]/15">
              <GraduationCapIcon className="size-5" />
            </div>
            <span
              aria-hidden
              className="absolute -right-0.5 -bottom-0.5 block size-3 rounded-full bg-[var(--monash-purple)] ring-2 ring-card"
            />
          </div>
          <div>
            <h1 className="text-base leading-tight font-semibold">monmap</h1>
            <p className="text-[11px] text-muted-foreground">
              A course mapper by Monash Association of Coding (MAC)
            </p>
          </div>
        </Link>
        <PrimaryNav />
      </div>
      <div className="flex items-center gap-3">
        {children}
        <UserMenu />
      </div>
    </header>
  )
}

function UserMenu() {
  const { data, isPending } = useSession()
  const router = useRouter()

  if (isPending) {
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
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar size="sm">
          {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
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
  )
}
