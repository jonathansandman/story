import { useSyncExternalStore } from 'react'

const query = '(min-width: 1024px)'

/** True at the desktop breakpoint (Tailwind `lg`). */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => matchMedia(query).matches,
  )
}
