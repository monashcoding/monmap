import { ArrowUpRightIcon, MessageSquareTextIcon } from "lucide-react"

import { GitHubIcon } from "@/components/icons/github"
import { cn } from "@/lib/utils"

const FEEDBACK_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfEMCU4OCItlK6DGgIXTovH7_sPSW6mZtMaPGf1OCUQW_43kg/viewform"
const REPO_URL = "https://github.com/monashcoding/monmap"
const MAC_URL = "https://monashcoding.com"

/** The outside links. The top bar and the mobile menu sheet both list them. */
export const HEADER_LINKS = [
  {
    href: MAC_URL,
    label: "MAC website",
    title: "Monash Association of Coding website",
    Icon: ArrowUpRightIcon,
  },
  {
    href: FEEDBACK_URL,
    label: "Feedback",
    title: "Give feedback",
    Icon: MessageSquareTextIcon,
  },
  {
    href: REPO_URL,
    label: "Contribute",
    title: "Contribute on GitHub",
    Icon: GitHubIcon,
  },
] as const

const linkClass =
  "inline-flex h-8 items-center gap-1.5 rounded-control px-2 text-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring lg:px-2.5"

/**
 * MAC website, feedback form and GitHub repo links for the top bar.
 * Icon-only below lg so the bar still fits beside the page's own
 * controls. Below md they move into the menu sheet.
 */
export function HeaderLinks({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-0.5 print:hidden", className)}>
      {HEADER_LINKS.map(({ href, label, title, Icon }) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={title}
          className={linkClass}
        >
          <Icon className="size-4" />
          <span className="hidden lg:inline">{label}</span>
        </a>
      ))}
    </div>
  )
}
