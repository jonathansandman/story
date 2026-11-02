import { findRepeats } from '@/lib/repeats'
import { characterSheet } from './build'
import { storyOrder, type StoryBundle } from './bundle'
import { CRAFT_RULES } from './craft'
import { compact, fields, list, section, text, type PromptSection } from './document'
import { render } from './render'

/**
 * A revision prompt: give the AI its own draft back with a precise brief for
 * improving it — without changing what happens. Works for one beat or a run
 * of beats (kept apart with [[Beat N]] markers so the reply splits back).
 */
export function buildPolishPrompt(bundle: StoryBundle, beatIds: string[], feedback = ''): string {
  const all = storyOrder(bundle).filter((l) => beatIds.includes(l.beat.id) && bundle.prose.has(l.beat.id))
  if (!all.length) return ''
  const multi = all.length > 1
  const story = bundle.story
  const draft = all.map((l) => `${multi ? `[[Beat ${l.beatIndex + 1}]]\n` : ''}${bundle.prose.get(l.beat.id)!.text.trim()}`).join('\n\n')
  const words = draft.split(/\s+/).length
  const repeats = findRepeats(draft)

  const onPage = [...new Set(all.flatMap((l) => (l.beat.characterIds.length ? l.beat.characterIds : l.chapter.characterIds)))]
  const pov = all[0]!.chapter.povCharacterId ? bundle.characters.get(all[0]!.chapter.povCharacterId!)?.name : ''

  const sections = compact<PromptSection>([
    section('task', 'Your task', [
      text(
        `Revise the draft below${multi ? ` (${all.length} beats)` : ''}. Keep what happens, the point of view, the tense, the heat level and roughly the same length (about ${Math.round(words / 50) * 50} words, ±15%). Make it better writing, not a different scene.`,
      ),
      list([
        repeats.length ? `These phrases repeat — vary or cut them: ${repeats.map((r) => `“${r.phrase}” (×${r.count})`).join(', ')}.` : null,
        'Cut anything that restates what the reader already knows, and any line that labels a trait or intention instead of showing it.',
        'Where two paragraphs do the same job, merge them and use the space for something new: an interior thought, a precise sensory detail, a line of dialogue with subtext.',
        ...CRAFT_RULES.slice(2),
        multi ? 'Keep each [[Beat N]] marker on its own line before that beat’s text. Apart from the markers, output only the revised prose.' : 'Output only the revised prose — no notes, headings or commentary.',
      ]),
      text(feedback.trim() ? `My notes on this draft: ${feedback.trim()}` : ''),
    ]),
    section('style', 'Style and rules (private notes — don’t quote them)', [
      fields([
        ['Point of view', [pov, story.pov].filter(Boolean).join(' — ')],
        ['Tense', story.tense],
        ['Heat level', story.heat],
        ['Style guide', story.style],
        ['Content rules', story.contentRules],
      ]),
    ]),
    section(
      'voices',
      'Voices',
      onPage.map((id) => {
        const c = bundle.characters.get(id)
        return c ? characterSheet(c, 'brief') : null
      }),
    ),
    section(
      'plan',
      'What each part must achieve',
      all.map((l) =>
        section('beat', `Beat ${l.beatIndex + 1}${l.beat.title ? `: ${l.beat.title}` : ''}`, [
          fields([
            ['What happens', l.beat.description],
            ['Emotional state', l.beat.emotion],
            ['Tone', l.beat.tone],
          ]),
        ]),
      ),
    ),
    section('draft', 'The draft', [text(draft)]),
  ])
  return render({ title: `Revise: ${story.title || 'Untitled story'}`, sections }, 'markdown')
}
