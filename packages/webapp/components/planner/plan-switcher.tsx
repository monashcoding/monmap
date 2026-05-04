"use client"

import { useState } from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import { usePlanner } from "./planner-context"

/**
 * Lets a signed-in user switch between named plans, create a new one,
 * rename, or delete. Hidden for anonymous users (their state lives in
 * localStorage with no name attached).
 */
export function PlanSwitcher() {
  const {
    currentUser,
    plans,
    activePlanId,
    switchPlan,
    createPlan,
    renamePlan,
    deletePlan,
  } = usePlanner()

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  if (!currentUser) return null

  const active = plans.find((p) => p.id === activePlanId)
  const label = active?.name ?? "Untitled plan"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm",
          "hover:bg-muted/60",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        )}
      >
        <span className="max-w-[160px] truncate">{label}</span>
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[260px]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] tracking-wider text-muted-foreground uppercase">
            Your plans
          </DropdownMenuLabel>
          {plans.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              No plans yet — create one to start saving.
            </div>
          ) : (
            plans.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={(e) => {
                // Sub-buttons rendered inside the row stop propagation;
                // the bare row click switches plans.
                if ((e.target as HTMLElement).closest("[data-row-action]")) {
                  return
                }
                if (p.id !== activePlanId) void switchPlan(p.id)
              }}
              className="group flex items-center gap-2 pr-1"
            >
              <CheckIcon
                className={cn(
                  "size-3.5 shrink-0",
                  p.id === activePlanId ? "opacity-100" : "opacity-0"
                )}
              />
              <span className="flex-1 truncate">{p.name}</span>
              <button
                data-row-action
                aria-label={`Rename ${p.name}`}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const next = window.prompt("Rename plan", p.name)
                  if (next && next.trim() && next.trim() !== p.name) {
                    void renamePlan(p.id, next.trim())
                  }
                }}
                className="invisible flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground group-hover:visible"
              >
                <PencilIcon className="size-3" />
              </button>
              <button
                data-row-action
                aria-label={`Delete ${p.name}`}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setPendingDeleteId(p.id)
                  if (
                    window.confirm(
                      `Delete "${p.name}"? This can't be undone.`
                    )
                  ) {
                    void deletePlan(p.id)
                  }
                  setPendingDeleteId(null)
                }}
                className={cn(
                  "invisible flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:visible",
                  pendingDeleteId === p.id && "visible"
                )}
              >
                <Trash2Icon className="size-3" />
              </button>
            </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            const name = window.prompt("Plan name", "New plan")
            if (name && name.trim()) {
              void createPlan(name.trim())
            }
          }}
        >
          <PlusIcon className="size-3.5" />
          New plan
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
