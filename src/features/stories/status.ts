import type { BeatStatus, StoryStatus } from '@/db/types'

/**
 * Beat statuses encode the "plan before you write" ladder. A beat is only
 * "ready" when the writer has decided it is — the app nudges but never forces.
 */
export const BEAT_STATUS: Record<BeatStatus, { label: string; hint: string; dot: string; bar: string }> = {
  idea: { label: 'Idea', hint: 'A spark. Not yet thought through.', dot: 'bg-faint/60', bar: 'bg-line-strong' },
  planned: { label: 'Planned', hint: 'What happens is clear; details may be thin.', dot: 'bg-[#7a8fa8]', bar: 'bg-[#7a8fa8]' },
  ready: { label: 'Ready to write', hint: 'Emotion, tone and must-haves decided.', dot: 'bg-accent', bar: 'bg-accent' },
  written: { label: 'Written', hint: 'Prose exists. Add a recap for continuity.', dot: 'bg-ok', bar: 'bg-ok' },
}

export const BEAT_STATUSES = Object.keys(BEAT_STATUS) as BeatStatus[]

export const STORY_STATUS: Record<StoryStatus, string> = {
  seed: 'Seed',
  outlining: 'Outlining',
  drafting: 'Drafting',
  complete: 'Complete',
}
