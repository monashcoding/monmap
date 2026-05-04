"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  CalendarIcon,
  CheckIcon,
  CloudIcon,
  GraduationCapIcon,
  LogOutIcon,
  TriangleAlertIcon,
} from "lucide-react"

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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { signOut } from "@/lib/auth-client"

import { PlanSwitcher } from "./plan-switcher"
import { usePlanner } from "./planner-context"

export function Header() {
  const { isSyncing, state, availableYears, switchYear, currentUser } =
    usePlanner()
  const [pendingYear, setPendingYear] = useState<string | null>(null)

  function handleYearChange(v: unknown) {
    if (typeof v !== "string" || !v || v === state.courseYear) return
    setPendingYear(v)
  }

  function confirmSwitch() {
    if (pendingYear) void switchYear(pendingYear)
    setPendingYear(null)
  }

  return (
    <>
      <AlertDialog
        open={pendingYear !== null}
        onOpenChange={(open) => {
          if (!open) setPendingYear(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to {pendingYear}?</AlertDialogTitle>
            <AlertDialogDescription>
              Switching the handbook year will clear all units from your
              planner. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSwitch}>
              Switch year
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <header className="relative flex items-center justify-between overflow-hidden rounded-3xl border bg-card px-5 py-3 shadow-card print:border-none print:bg-transparent print:shadow-none">
        <div className="flex items-center gap-3">
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
            <h1 className="text-base leading-tight font-semibold">
              monmap{" "}
              <span className="font-normal text-[var(--monash-purple)]">
                / planner
              </span>
            </h1>
            <p className="text-[11px] text-muted-foreground">
              A course planner, by Monash Association of Coding
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isSyncing ? (
            <span className="animate-pulse text-[11px] text-muted-foreground">
              syncing…
            </span>
          ) : (
            <SaveStatusPill />
          )}
          <PlanSwitcher />
          <div className="flex items-center gap-2">
            <CalendarIcon className="size-3.5 text-muted-foreground" />
            <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Starting year
            </span>
            <Select value={state.courseYear} onValueChange={handleYearChange}>
              <SelectTrigger className="h-8 min-w-[88px] text-xs">
                <SelectValue placeholder={state.courseYear} />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {availableYears.map((y) => (
                  <SelectItem key={y} value={y} className="text-xs">
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {currentUser ? <UserMenu /> : null}
        </div>
      </header>
    </>
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
