"use client"

import { CheckIcon, ListOrderedIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import { SORT_OPTIONS, type SortKey } from "./config"

export function SortPopover({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  value: SortKey
  onChange: (v: SortKey) => void
}) {
  const current = SORT_OPTIONS.find((o) => o.key === value)
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant={value !== "relevance" ? "default" : "outline"}
            className="h-7 gap-1.5 rounded-lg px-2.5 text-xs"
          />
        }
      >
        <ListOrderedIcon className="size-3" />
        {value === "relevance" ? "Sort" : current?.short}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[min(220px,calc(100vw-2rem))] p-0"
      >
        <div className="p-1.5">
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                onChange(key)
                onOpenChange(false)
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-primary/40",
                value === key
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              )}
            >
              <span>{label}</span>
              {value === key && (
                <CheckIcon className="size-3.5 shrink-0 text-primary" />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
