import type { Modifier } from '@dnd-kit/core'

/** Inlined from @dnd-kit/modifiers to avoid an extra dependency. */
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })
