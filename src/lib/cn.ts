import clsx, { type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge about our semantic colour and shadow tokens so that
// e.g. `text-muted` and `text-[15px]` aren't treated as conflicting.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: ['bg', 'surface', 'surface-2', 'surface-3', 'line', 'line-strong', 'ink', 'muted', 'faint', 'accent', 'accent-hover', 'accent-soft', 'accent-ink', 'ok', 'warn'],
      shadow: ['soft', 'lift'],
    },
  },
})

/** Join class names; later classes override conflicting earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
