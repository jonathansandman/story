import type { Beat, Chapter, Character, DetailLevel, ExportOptions, Relationship, Story } from '@/db/types'
import { compact, fields, list, section, text, type PromptDocument, type PromptNode, type PromptSection } from './document'
import { storyOrder, type ExportScope, type LocatedBeat, type StoryBundle } from './bundle'

/**
 * The prompt builder.
 *
 * Section order is deliberate — it mirrors how a human editor would brief a
 * ghostwriter, and puts the actionable part (the beat) *last*, closest to
 * where the model starts generating:
 *
 *   1. Task            what to write, POV, tense, length, where to stop
 *   2. Story           premise, heat, style guide, content rules
 *   3. Characters      only those on the page, at the chosen detail level
 *   4. Relationships   only between characters who are both on the page
 *   5. Story so far    one line per earlier chapter + earlier beats here
 *   6. Pick up here    tail of the previous beat's prose, for a seamless join
 *   7. Chapter         purpose, setting, POV
 *   8. Beat(s)         what happens, emotion, tone, pacing, include/avoid
 *   9. Stop marker     the next beat, explicitly "do not write"
 */

/** Per-character overrides chosen in the composer (not persisted). */
export type CharacterOverride = DetailLevel | 'exclude'

export interface BuildInput {
  bundle: StoryBundle
  scope: ExportScope
  options: ExportOptions
  overrides?: Record<string, CharacterOverride>
}

export interface BuildResult {
  doc: PromptDocument
  /** Characters resolved as "on the page", in display order. */
  characterIds: string[]
  /** Beats being written, in story order. */
  beats: LocatedBeat[]
}

/** Cap on earlier chapters listed in "story so far"; older ones are counted, not listed. */
export const CONTINUITY_CHAPTER_LIMIT = 8
/** Cap on characters used when condensing a planned beat into a continuity line. */
const CONDENSE_CHARS = 220

export function buildPrompt({ bundle, scope, options, overrides = {} }: BuildInput): BuildResult {
  const all = storyOrder(bundle)
  const targets = resolveTargets(all, scope)
  const characterIds = resolveCharacters(bundle, scope, targets).filter((id) => overrides[id] !== 'exclude')
  const story = bundle.story
  const first = targets[0]
  const last = targets.at(-1)

  const sections = compact<PromptSection>([
    options.includeTask && taskSection(story, scope, targets, bundle, options),
    options.includeStory && storySection(story, options.characterDetail),
    charactersSection(bundle, characterIds, options, overrides, primaryPov(bundle, targets)),
    options.includeRelationships && relationshipsSection(bundle.relationships, characterIds, bundle.characters),
    options.includeContinuity && first && continuitySection(bundle, all, first, scope),
    options.includePreviousPassage && first && previousPassageSection(bundle, all, first),
    ...chapterSections(bundle, targets, scope, options),
    options.includeNextBeat && last && nextSection(bundle, all, last, scope),
  ])

  return { doc: { title: documentTitle(story, scope, targets), sections }, characterIds, beats: targets }
}

/* ───────────────────────────── Scope resolution ───────────────────────────── */

function resolveTargets(all: LocatedBeat[], scope: ExportScope): LocatedBeat[] {
  switch (scope.kind) {
    case 'beat':
      return all.filter((l) => l.beat.id === scope.beatId)
    case 'chapter':
      return all.filter((l) => l.chapter.id === scope.chapterId)
    case 'selection': {
      const ids = new Set(scope.beatIds)
      return all.filter((l) => ids.has(l.beat.id))
    }
  }
}

/**
 * "Relevant character context" =
 *   for each target beat: its own characters, or — if it has none — its chapter's;
 *   plus the chapter's POV character (the reader is in their head even if the
 *   beat forgot to tag them).
 * For a whole-chapter prompt, the chapter's declared cast is always added too.
 * Ordered: POV first, then story-cast order, then anything else.
 */
export function resolveCharacters(bundle: StoryBundle, scope: ExportScope, targets: LocatedBeat[]): string[] {
  const ids = new Set<string>()
  const add = (id: string | null | undefined) => {
    if (id && bundle.characters.has(id)) ids.add(id)
  }

  const chapters = new Set<Chapter>(targets.map((t) => t.chapter))
  if (scope.kind === 'chapter') {
    const ch = bundle.chapters.find((c) => c.id === scope.chapterId)
    if (ch) chapters.add(ch)
  }

  for (const ch of chapters) add(ch.povCharacterId)
  for (const t of targets) {
    const own = t.beat.characterIds.length ? t.beat.characterIds : t.chapter.characterIds
    own.forEach(add)
  }
  // A whole-chapter prompt also carries the chapter's declared cast.
  if (scope.kind === 'chapter' || targets.length === 0) for (const ch of chapters) ch.characterIds.forEach(add)

  const povs = [...chapters].map((c) => c.povCharacterId)
  const castOrder = bundle.story.cast.map((m) => m.characterId)
  const rank = (id: string) => {
    const p = povs.indexOf(id)
    if (p >= 0) return p - 1000
    const c = castOrder.indexOf(id)
    return c >= 0 ? c : 999
  }
  return [...ids].sort((a, b) => rank(a) - rank(b))
}

function primaryPov(bundle: StoryBundle, targets: LocatedBeat[]): string | null {
  const id = targets[0]?.chapter.povCharacterId ?? null
  return id && bundle.characters.has(id) ? id : null
}

/* ───────────────────────────── Title & task ───────────────────────────── */

const chapterLabel = (ch: Chapter, index: number) => `Chapter ${index + 1}${ch.title ? `: ${ch.title}` : ''}`
const beatLabel = (b: Beat, index: number) => `Beat ${index + 1}${b.title ? `: ${b.title}` : ''}`

function documentTitle(story: Story, scope: ExportScope, targets: LocatedBeat[]): string {
  const name = story.title || 'Untitled story'
  const t = targets[0]
  if (scope.kind === 'beat' && t) return `${name} — Chapter ${t.chapterIndex + 1}, ${beatLabel(t.beat, t.beatIndex)}`
  if (scope.kind === 'chapter') {
    if (t) return `${name} — ${chapterLabel(t.chapter, t.chapterIndex)}`
    return `${name} — Chapter brief`
  }
  return `${name} — ${targets.length} selected beat${targets.length === 1 ? '' : 's'}`
}

function taskSection(
  story: Story,
  scope: ExportScope,
  targets: LocatedBeat[],
  bundle: StoryBundle,
  options: ExportOptions,
): PromptSection | null {
  const pov = targets[0]?.chapter.povCharacterId
  const povName = pov ? bundle.characters.get(pov)?.name : undefined
  const words = targets.reduce((sum, t) => sum + (t.beat.targetWords ?? 0), 0)
  // Whole-chapter prompts ask for beat markers so the reply can be split back into beats.
  const markers = scope.kind === 'chapter' && targets.length > 1

  let what: string
  if (scope.kind === 'beat') {
    what =
      'Write the prose for the beat described at the end of this brief, as one continuous scene segment. ' +
      'Pick up exactly where the story so far leaves off, and stop when this beat is complete.'
  } else if (scope.kind === 'chapter') {
    what =
      targets.length > 0
        ? `Write this chapter in full, moving through its ${targets.length} beats in order. ` +
          'Treat each beat as a movement within the chapter, not a separate scene with its own heading — transitions should be seamless.'
        : 'Write this chapter in full from the chapter brief below.'
  } else {
    what =
      `Write the prose for the ${targets.length} beats below, in order, as continuous narrative. ` +
      'Where consecutive beats are from different chapters, mark the break with a centred "* * *".'
  }

  const rules = compact([
    povName || story.pov ? `Point of view: ${[povName && `${povName}`, story.pov].filter(Boolean).join(' — ')}.` : null,
    story.tense ? `Tense: ${story.tense}.` : null,
    words > 0 ? `Length: roughly ${words.toLocaleString('en-US')} words.` : null,
    'Stay in character: honour each character\'s voice, desires and boundaries as written.',
    options.includeNextBeat ? 'Do not write past the point marked "Stop before".' : null,
    markers
      ? `Put a marker on its own line before each beat: ${targets
          .slice(0, 3)
          .map((t) => `[[Beat ${t.beatIndex + 1}]]`)
          .join(', ')}${targets.length > 3 ? ', …' : ''} (matching the beat numbers below). They are only used to file your text in my app and will be removed. Apart from these markers, output prose only — no headings, summaries or commentary.`
      : 'Output prose only — no headings, beat labels, summaries, or commentary.',
  ])

  return section('task', 'Your task', [text(what), list(rules), text(options.extraInstructions)])
}

/* ───────────────────────────── Story ───────────────────────────── */

function storySection(story: Story, detail: DetailLevel): PromptSection | null {
  return section('story', 'The story', [
    fields([
      ['Title', story.title],
      ['Logline', story.logline],
      ['Genre', story.genre],
      ['Heat level', story.heat],
      ['Premise', detail !== 'brief' && story.premise],
      ['Setting and world', story.world],
    ]),
    section('style', 'Style guide', [text(story.style)]),
    section('content_rules', 'Content rules', [text(story.contentRules)]),
  ])
}

/* ───────────────────────────── Characters ───────────────────────────── */

function charactersSection(
  bundle: StoryBundle,
  ids: string[],
  options: ExportOptions,
  overrides: Record<string, CharacterOverride>,
  povId: string | null,
): PromptSection | null {
  const sheets = ids.map((id) => {
    const c = bundle.characters.get(id)
    if (!c) return null
    const level = overrides[id] && overrides[id] !== 'exclude' ? overrides[id] : options.characterDetail
    const cast = bundle.story.cast.find((m) => m.characterId === id)
    return characterSheet(c, level, {
      role: [id === povId ? 'POV' : '', cast?.role ?? ''].filter(Boolean).join(', '),
      storyNotes: cast?.storyNotes ?? '',
      includeNotes: options.includeWriterNotes,
    })
  })
  return section('characters', 'Characters on the page', sheets)
}

export interface SheetContext {
  role?: string
  storyNotes?: string
  includeNotes?: boolean
}

/**
 * A character sheet at a given detail level.
 *
 *   brief     identity, tagline, essential traits, voice, boundaries
 *   standard  + personality, motivations, desires, 3 sample lines, story notes
 *   full      + every trait, backstory, all sample lines
 *
 * Boundaries are included at every level: they are short and the one thing
 * the writing model must never get wrong.
 */
export function characterSheet(c: Character, level: DetailLevel, ctx: SheetContext = {}): PromptSection {
  const std = level !== 'brief'
  const full = level === 'full'
  const identity = [c.pronouns, c.age && `${c.age}`, ctx.role].filter(Boolean).join(' · ')
  const traits = c.appearance.filter((t) => t.value.trim() && (full || t.essential))
  const lines = c.sampleLines.filter((l) => l.trim()).slice(0, full ? undefined : std ? 3 : 0)

  const node = section(
    'character',
    c.name || 'Unnamed character',
    [
      fields([
        ['Identity', identity],
        ['Also called', c.aka],
        ['Essence', c.tagline],
      ]),
      traits.length ? fields([['Appearance', traits.map((t) => (t.label ? `${t.label}: ${t.value}` : t.value)).join('\n')]]) : null,
      fields([
        ['In this story', std && ctx.storyNotes],
        ['Personality', std && c.personality],
        ['Voice', c.voice],
        ['Sample lines', lines.length > 0 && lines.map((l) => `"${l.replace(/^["“]|["”]$/g, '')}"`).join('\n')],
        ['Wants', std && c.motivations],
        ['Desires', std && c.desires],
        ['Boundaries', c.boundaries],
        ['Backstory', full && c.backstory],
        ['Writer notes', ctx.includeNotes && c.notes],
      ]),
    ],
    { name: c.name || 'Unnamed' },
  )
  return node ?? { kind: 'section', key: 'character', title: c.name || 'Unnamed character', children: [], attrs: { name: c.name } }
}

/* ───────────────────────────── Relationships ───────────────────────────── */

function relationshipsSection(
  relationships: Relationship[],
  ids: string[],
  characters: Map<string, Character>,
): PromptSection | null {
  const inScope = new Set(ids)
  const nodes = relationships
    .filter((r) => inScope.has(r.characterIds[0]) && inScope.has(r.characterIds[1]))
    .map((r) => {
      // Name the pair in prompt order (POV first) rather than storage order.
      const [a, b] = [...r.characterIds]
        .sort((x, y) => ids.indexOf(x) - ids.indexOf(y))
        .map((id) => characters.get(id)?.name ?? 'Unknown')
      return section(
        'relationship',
        `${a} & ${b}${r.label ? ` — ${r.label}` : ''}`,
        [
          fields([
            ['Dynamic', r.dynamic],
            ['History', r.history],
            ['Current tension', r.tension],
            ['Consent and check-ins', r.consent],
          ]),
        ],
        { between: `${a}, ${b}` },
      )
    })
  return section('relationships', 'Relationships', nodes)
}

/* ───────────────────────────── Continuity ───────────────────────────── */

/** First sentence(s) of a planned beat, trimmed — enough for continuity, not a second copy of the plan. */
export function condense(s: string, max = CONDENSE_CHARS): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}…`
}

function beatContinuityLine(l: LocatedBeat, written: boolean): string | null {
  if (l.beat.recap.trim()) return l.beat.recap.trim()
  if (l.beat.description.trim()) return `${condense(l.beat.description)}${written ? '' : ' (planned)'}`
  return null
}

/** How much of the previous passage to quote. ~250 words keeps voice and momentum without bloat. */
export const PASSAGE_TAIL_WORDS = 250

/** The last ~N words of a text, starting at a paragraph or sentence boundary where possible. */
export function tailWords(text: string, n = PASSAGE_TAIL_WORDS): { text: string; truncated: boolean } {
  const t = text.trim()
  const words = t.split(/\s+/)
  if (words.length <= n) return { text: t, truncated: false }
  // Find the character offset where the last n words begin.
  let idx = t.length
  for (let count = 0; count < n && idx > 0; ) {
    idx = t.lastIndexOf(' ', idx - 1)
    if (idx < 0) return { text: t, truncated: false }
    count++
  }
  const window = t.slice(idx).trimStart()
  // Prefer to start at a paragraph, then a sentence, within the first third of the window.
  const limit = Math.floor(window.length / 3)
  const para = window.indexOf('\n')
  if (para >= 0 && para < limit) return { text: window.slice(para).trim(), truncated: true }
  const sentence = window.search(/[.!?…]["”’)]?\s+/)
  if (sentence >= 0 && sentence < limit) {
    const m = /[.!?…]["”’)]?\s+/.exec(window.slice(sentence))
    return { text: window.slice(sentence + (m?.[0].length ?? 1)).trim(), truncated: true }
  }
  return { text: window, truncated: true }
}

/**
 * The end of the prose immediately before the first target beat (across a
 * chapter break if needed), so the writing model continues it seamlessly.
 */
function previousPassageSection(bundle: StoryBundle, all: LocatedBeat[], first: LocatedBeat): PromptSection | null {
  const i = all.findIndex((l) => l.beat.id === first.beat.id)
  const prev = i > 0 ? all[i - 1] : undefined
  const draft = prev && bundle.prose.get(prev.beat.id)
  if (!prev || !draft) return null
  const { text: tail, truncated } = tailWords(draft.text)
  const crossesChapter = prev.chapter.id !== first.chapter.id
  return section('previous_passage', 'Pick up from here — the end of the previous passage', [
    text(
      `${crossesChapter ? `This is the end of ${chapterLabel(prev.chapter, prev.chapterIndex)}. Begin the new chapter` : 'Continue directly from this'} — match its voice and rhythm, and do not repeat or summarise it.`,
    ),
    text(`${truncated ? '…' : ''}${tail}`),
  ])
}

function continuitySection(
  bundle: StoryBundle,
  all: LocatedBeat[],
  first: LocatedBeat,
  scope: ExportScope,
): PromptSection | null {
  const earlierChapters = bundle.chapters.slice(0, first.chapterIndex)
  const omitted = Math.max(0, earlierChapters.length - CONTINUITY_CHAPTER_LIMIT)
  const shown = earlierChapters.slice(omitted)

  const chapterLines = shown.map((ch, i) => {
    const idx = omitted + i
    const body = ch.summary.trim() || ch.purpose.trim() || '(no summary yet)'
    return `${chapterLabel(ch, idx)} — ${body}`
  })

  // Earlier beats within the first target's chapter (not needed for whole-chapter scope).
  const earlierBeats =
    scope.kind === 'chapter'
      ? []
      : all
          .filter((l) => l.chapter.id === first.chapter.id && l.beatIndex < first.beatIndex)
          .map((l) => {
            const line = beatContinuityLine(l, bundle.prose.has(l.beat.id))
            return line ? `${beatLabel(l.beat, l.beatIndex)} — ${line}` : null
          })

  return section('story_so_far', 'Story so far', [
    omitted ? text(`(${omitted} earlier chapter${omitted === 1 ? '' : 's'} omitted for brevity.)`) : null,
    list(chapterLines),
    earlierBeats.some(Boolean)
      ? section('earlier_in_chapter', `Earlier in ${chapterLabel(first.chapter, first.chapterIndex)}`, [list(earlierBeats)])
      : null,
  ])
}

/* ───────────────────────────── Chapter & beats ───────────────────────────── */

function beatNode(bundle: StoryBundle, l: LocatedBeat): PromptSection {
  const b = l.beat
  const names = (b.characterIds.length ? b.characterIds : l.chapter.characterIds)
    .map((id) => bundle.characters.get(id)?.name)
    .filter(Boolean)
    .join(', ')
  return (
    section(
      'beat',
      beatLabel(b, l.beatIndex),
      [
        fields([
          ['What happens', b.description],
          ['On the page', names],
          ['Emotional state', b.emotion],
          ['Tone', b.tone],
          ['Pacing', b.pacing],
          ['Must include', b.mustInclude],
          ['Must avoid', b.mustAvoid],
          ['Length', b.targetWords ? `~${b.targetWords.toLocaleString('en-US')} words` : ''],
        ]),
      ],
      { number: String(l.beatIndex + 1), ...(b.title ? { title: b.title } : {}) },
    ) ?? { kind: 'section', key: 'beat', title: beatLabel(b, l.beatIndex), children: [text('(No description yet.)') as PromptNode] }
  )
}

function chapterBrief(bundle: StoryBundle, ch: Chapter, includeSummary: boolean): PromptNode | null {
  const pov = ch.povCharacterId ? bundle.characters.get(ch.povCharacterId)?.name : ''
  return fields([
    ['Purpose', ch.purpose],
    ['Setting', ch.setting],
    ['POV', pov],
    ['Summary', includeSummary && ch.summary],
  ])
}

function chapterSections(
  bundle: StoryBundle,
  targets: LocatedBeat[],
  scope: ExportScope,
  options: ExportOptions,
): PromptSection[] {
  // Group target beats by chapter, preserving story order.
  const groups: Array<{ chapter: Chapter; index: number; beats: LocatedBeat[] }> = []
  for (const t of targets) {
    const g = groups.at(-1)
    if (g && g.chapter.id === t.chapter.id) g.beats.push(t)
    else groups.push({ chapter: t.chapter, index: t.chapterIndex, beats: [t] })
  }
  if (scope.kind === 'chapter' && groups.length === 0) {
    const index = bundle.chapters.findIndex((c) => c.id === scope.chapterId)
    const chapter = bundle.chapters[index]
    if (chapter) groups.push({ chapter, index, beats: [] })
  }

  const chapterNodes = compact(
    groups.map((g) => {
      const notes = options.includeWriterNotes ? fields([['Writer notes', g.chapter.notes]]) : null
      const beats = scope.kind === 'beat' ? [] : g.beats.map((l) => beatNode(bundle, l))
      // A single-beat prompt gets the chapter summary as context; a chapter prompt
      // only needs it as a fallback when there are no beats to work from.
      const withSummary = scope.kind === 'beat' || (scope.kind === 'chapter' && beats.length === 0)
      return section(
        'chapter',
        chapterLabel(g.chapter, g.index),
        [chapterBrief(bundle, g.chapter, withSummary), notes, beats.length ? section('beats', 'Beats', beats) : null],
        { number: String(g.index + 1), ...(g.chapter.title ? { title: g.chapter.title } : {}) },
      )
    }),
  )

  // A single beat is promoted to its own top-level section, last — closest to generation.
  const single = scope.kind === 'beat' ? targets[0] : undefined
  return single ? [...chapterNodes, { ...beatNode(bundle, single), title: `The beat — ${beatLabel(single.beat, single.beatIndex)}` }] : chapterNodes
}

/* ───────────────────────────── Stop marker ───────────────────────────── */

function nextSection(bundle: StoryBundle, all: LocatedBeat[], last: LocatedBeat, scope: ExportScope): PromptSection | null {
  if (scope.kind === 'chapter') {
    const next = bundle.chapters[last.chapterIndex + 1]
    if (!next) return null
    const what = next.purpose || next.summary
    return section('stop_before', 'Stop before (next chapter — do not write)', [
      text(`${chapterLabel(next, last.chapterIndex + 1)}${what ? ` — ${condense(what)}` : ''}`),
    ])
  }
  const i = all.findIndex((l) => l.beat.id === last.beat.id)
  const next = all[i + 1]
  if (!next) return null
  const line = condense(next.beat.description) || '(not yet planned)'
  const where = next.chapter.id === last.chapter.id ? '' : ` (${chapterLabel(next.chapter, next.chapterIndex)})`
  return section('stop_before', 'Stop before (next beat — do not write)', [
    text(`${beatLabel(next.beat, next.beatIndex)}${where} — ${line}`),
  ])
}

/* ───────────────────────────── Follow-up (same chat) ───────────────────────────── */

/**
 * A short prompt for continuing in the *same* AI chat: the model already has
 * the story bible, characters and its own previous passage, so we only send
 * the next beat, any characters new to the page, and the stop marker.
 */
export function buildFollowUp(bundle: StoryBundle, beatId: string, options: ExportOptions): BuildResult {
  const all = storyOrder(bundle)
  const i = all.findIndex((l) => l.beat.id === beatId)
  const cur = all[i]
  if (!cur) return { doc: { title: 'Beat not found', sections: [] }, characterIds: [], beats: [] }
  const prev = all[i - 1]
  const newChapter = !prev || prev.chapter.id !== cur.chapter.id

  const onPage = resolveCharacters(bundle, { kind: 'beat', beatId }, [cur])
  // Anyone not on the page earlier in this chapter gets a brief sheet.
  const seen = new Set(
    all
      .filter((l) => l.chapter.id === cur.chapter.id && l.beatIndex < cur.beatIndex)
      .flatMap((l) => resolveCharacters(bundle, { kind: 'beat', beatId: l.beat.id }, [l])),
  )
  const fresh = newChapter ? onPage : onPage.filter((id) => !seen.has(id))
  const words = cur.beat.targetWords

  const task = section('task', 'Next', [
    text(
      newChapter
        ? `Now start ${chapterLabel(cur.chapter, cur.chapterIndex)}, with the beat below. Same story, style and rules as before.`
        : 'Continue directly from the end of your last passage with the next beat, below. Same point of view, tense, style and rules as before — don’t repeat or summarise what you already wrote.',
    ),
    list([
      words ? `Length: roughly ${words.toLocaleString('en-US')} words.` : null,
      options.includeNextBeat ? 'Stop at the point marked "Stop before".' : null,
      'Output prose only — no headings, summaries or commentary.',
    ]),
    text(options.extraInstructions),
  ])

  const sections = compact<PromptSection>([
    task,
    newChapter && section('chapter', chapterLabel(cur.chapter, cur.chapterIndex), [chapterBrief(bundle, cur.chapter, true)]),
    fresh.length > 0 &&
      section(
        'characters',
        newChapter ? 'Characters on the page' : 'New on the page',
        fresh.map((id) => {
          const c = bundle.characters.get(id)
          if (!c) return null
          const cast = bundle.story.cast.find((m) => m.characterId === id)
          return characterSheet(c, 'brief', { role: cast?.role ?? '', storyNotes: cast?.storyNotes ?? '' })
        }),
      ),
    { ...beatNode(bundle, cur), title: `The beat — ${beatLabel(cur.beat, cur.beatIndex)}` },
    options.includeNextBeat && nextSection(bundle, all, cur, { kind: 'beat', beatId }),
  ])

  return {
    doc: { title: `Next: Chapter ${cur.chapterIndex + 1}, ${beatLabel(cur.beat, cur.beatIndex)}`, sections },
    characterIds: onPage,
    beats: [cur],
  }
}
