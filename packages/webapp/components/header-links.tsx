import { ArrowUpRightIcon, MessageSquareTextIcon } from "lucide-react"

import { GitHubIcon } from "@/components/icons/github"

const FEEDBACK_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfEMCU4OCItlK6DGgIXTovH7_sPSW6mZtMaPGf1OCUQW_43kg/viewform"
const REPO_URL = "https://github.com/monashcoding/monmap"
const MAC_URL = "https://monashcoding.com"

const linkClass =
  "inline-flex h-8 items-center gap-1.5 rounded-control px-2 text-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring lg:px-2.5"

/**
 * MAC website, feedback form and GitHub repo links for the top bar.
 * Icon-only below lg so the bar still fits beside the page's own
 * controls.
 */
export function HeaderLinks() {
  return (
    <div className="flex items-center gap-0.5 print:hidden">
      <a
        href={MAC_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Monash Association of Coding website"
        className={linkClass}
      >
        <ArrowUpRightIcon className="size-4" />
        <span className="hidden lg:inline">MAC website</span>
      </a>
      <a
        href={FEEDBACK_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Give feedback"
        className={linkClass}
      >
        <MessageSquareTextIcon className="size-4" />
        <span className="hidden lg:inline">Feedback</span>
      </a>
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Contribute on GitHub"
        className={linkClass}
      >
        <GitHubIcon className="size-4" />
        <span className="hidden lg:inline">Contribute</span>
      </a>
    </div>
  )
}
