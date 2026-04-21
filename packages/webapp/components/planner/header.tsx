"use client";

import { GraduationCapIcon } from "lucide-react";

import { usePlanner } from "./planner-context";

export function Header() {
  const { isSyncing } = usePlanner();

  return (
    <header className="relative flex items-center justify-between overflow-hidden rounded-3xl border bg-card px-5 py-3 shadow-card print:bg-transparent print:border-none print:shadow-none">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground ring-2 ring-[var(--monash-purple)]/15">
            <GraduationCapIcon className="size-5" />
          </div>
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 block size-3 rounded-full bg-[var(--monash-purple)] ring-2 ring-card"
          />
        </div>
        <div>
          <h1 className="text-base font-semibold leading-tight">
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
      <div className="flex items-center gap-2">
        {isSyncing ? (
          <span className="text-[11px] text-muted-foreground animate-pulse">
            syncing…
          </span>
        ) : null}
      </div>
    </header>
  );
}
