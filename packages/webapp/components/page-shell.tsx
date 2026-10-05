import { AppHeader } from "@/components/app-header"

/**
 * The page column with the site header on top, shared by every page
 * except the planner, which needs room below for its mobile buttons.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-[1500px] flex-col gap-3 px-3 pt-3 pb-12 sm:gap-5 sm:px-5 sm:pt-5">
      <AppHeader />
      {children}
    </main>
  )
}
