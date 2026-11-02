import type { Character, Story } from '@/db/types'
import type { Plan } from './plan'

const short = (s: string, n = 180) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/**
 * After a story- or character-level edit is applied, describe what changed as
 * a "[CHANGE]" idea for the outline, so the writer can weave it through the
 * existing chapters and beats in one tap instead of hunting for stale beats.
 */
export function changeIdeasFor(plan: Plan, selected: Set<string>, stories: Story[], storiesWithBeats: Set<string>): { storyId: string; text: string }[] {
  const out = new Map<string, string[]>()
  const push = (storyId: string, line: string) => out.set(storyId, [...(out.get(storyId) ?? []), line])
  const chosen = plan.changes.filter((c) => (c.required || selected.has(c.key)) && c.op === 'update')

  for (const c of chosen) {
    const fields = c.fields.filter((f) => !['Cast', 'Cast notes', 'Tags'].includes(f.label))
    if (!fields.length) continue
    const desc = fields.map((f) => `${f.label}: “${short(f.before)}” → “${short(f.after)}”`).join('; ')
    if (c.group === 'story' && storiesWithBeats.has(c.row.id)) push(c.row.id, desc)
    if (c.group === 'character') {
      const ch = c.row as Character
      for (const s of stories) if (storiesWithBeats.has(s.id) && s.cast.some((m) => m.characterId === ch.id)) push(s.id, `${ch.name} — ${desc}`)
    }
  }
  return [...out].map(([storyId, lines]) => ({ storyId, text: `Update the outline to match these changes: ${lines.join(' | ')}` }))
}
