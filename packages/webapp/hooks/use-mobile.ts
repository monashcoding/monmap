import { useSyncExternalStore } from "react"

const MOBILE_BREAKPOINT = 768

// One subscribe function per query, so React doesn't unsubscribe and
// resubscribe on every render.
const subscribers = new Map<string, (onChange: () => void) => () => void>()

function subscriberFor(query: string) {
  let subscribe = subscribers.get(query)
  if (!subscribe) {
    subscribe = (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    }
    subscribers.set(query, subscribe)
  }
  return subscribe
}

/** Whether a media query matches. False during server rendering. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    subscriberFor(query),
    () => window.matchMedia(query).matches,
    () => false
  )
}

/** True below the `md` breakpoint. False during server rendering. */
export function useIsMobile() {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
}
