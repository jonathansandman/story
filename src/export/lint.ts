import type { BuildResult } from './build'
import type { StoryBundle } from './bundle'

/**
 * Readiness hints shown in the composer. These are gentle nudges, not errors:
 * the point of Trellis is to make the writer *notice* what the AI will have to
 * guess, so they can choose to slow down and plan it.
 */
export interface Hint {
  level: 'info' | 'warn'
  message: string
}

export function lintPrompt(bundle: StoryBundle, result: BuildResult): Hint[] {
  const hints: Hint[] = []
  const { story } = bundle

  if (result.beats.length === 0) hints.push({ level: 'warn', message: 'No beats yet — the AI will only have the chapter brief to go on.' })
  if (result.characterIds.length === 0)
    hints.push({ level: 'warn', message: 'No characters on the page. Tag characters on the beat or chapter so their sheets are included.' })

  for (const l of result.beats) {
    const name = l.beat.title || `Beat ${l.beatIndex + 1}`
    if (!l.beat.description.trim()) hints.push({ level: 'warn', message: `"${name}" has no description of what happens.` })
    else if (!l.beat.emotion.trim()) hints.push({ level: 'info', message: `"${name}" has no emotional state — the AI will guess how everyone feels.` })
  }

  for (const id of result.characterIds) {
    const c = bundle.characters.get(id)
    if (c && !c.tagline.trim()) hints.push({ level: 'info', message: `${c.name || 'A character'} has no essence line — it's the most useful single field.` })
    if (c && !c.boundaries.trim() && story.heat.trim())
      hints.push({ level: 'info', message: `${c.name} has no boundaries written down.` })
  }

  if (!story.style.trim()) hints.push({ level: 'info', message: 'The story has no style guide; the prose will default to the model\'s house voice.' })

  const first = result.beats[0]
  if (first) {
    const earlier = (bundle.beatsByChapter.get(first.chapter.id) ?? []).slice(0, first.beatIndex)
    const missing = earlier.filter((b) => b.status === 'written' && !b.recap.trim()).length
    if (missing) hints.push({ level: 'info', message: `${missing} earlier written beat${missing === 1 ? ' has' : 's have'} no recap; continuity will use the plan instead.` })
  }
  return hints
}
