"use client"

import { useRouter } from "next/navigation"
import {
  CheckIcon,
  CloudIcon,
  LogOutIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { AppHeader } from "@/components/app-header"
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
import { signOut } from "@/lib/auth-client"

import { AnonymousBanner } from "./anonymous-banner"
import { usePlanner } from "./planner-context"

export function Header() {
  const { isSyncing, currentUser } = usePlanner()

  return (
    <AppHeader
      rightSlot={
        <>
          {isSyncing ? (
            <span className="animate-pulse text-[11px] text-muted-foreground">
              syncing…
            </span>
          ) : (
            <SaveStatusPill />
          )}
          {currentUser ? <UserMenu /> : <AnonymousBanner />}
        </>
      }
    />
  )
}

function SaveStatusPill() {
  const { saveStatus, currentUser } = usePlanner()

  // Anonymous local-only state is communicated by the banner; no pill
  // needed in the header for it.
  if (!currentUser) return null

  if (saveStatus === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <CloudIcon className="size-3.5 animate-pulse" />
        saving…
      </span>
    )
  }

  if (saveStatus === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <CheckIcon className="size-3.5 text-emerald-600" />
        saved
      </span>
    )
  }

  if (saveStatus === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
        <TriangleAlertIcon className="size-3.5" />
        save failed — will retry
      </span>
    )
  }

  return null
}

function UserMenu() {
  const { currentUser } = usePlanner()
  const router = useRouter()
  if (!currentUser) return null

  const initials = currentUser.name
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
          {currentUser.image ? (
            <AvatarImage src={currentUser.image} alt={currentUser.name} />
          ) : null}
          <AvatarFallback>{initials || "?"}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col">
              <span className="text-sm font-medium">{currentUser.name}</span>
              <span className="text-[11px] text-muted-foreground">
                {currentUser.email}
              </span>
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
