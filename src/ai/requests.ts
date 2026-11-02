import type { Beat, Chapter, Character, Idea, Relationship, Story } from '@/db/types'
import type { Direction, StyleChoice } from './options'
import type { PatchCharacter } from './patch'
import type { DataState } from './plan'

/**
 * Prompts that ask an external AI to *generate or edit planning data* (as
 * opposed to export/, which asks it to write prose). Every request:
 *   1. says what the writer wants, in their words,
 *   2. includes the relevant current data as JSON, with ids,
 *   3. specifies the exact reply format, so the reply can be pasted straight
 *      back into Trellis and previewed as a set of changes.
 */

/** The writer's starting point for a new story. Everything but `text` is optional. */
export interface Spark {
  text: string
  characterIds: string[]
  /** '' = let the AI suggest. */
  heat: string
  length: 'short' | 'novella' | 'novel'
  density: 'lean' | 'rich' | 'lush'
  /** Outlining an EXISTING story (its bible and cast are sent as context, ids kept). */
  storyId?: string
}

/** What the writer picked from the AI's options. */
export interface Picks {
  direction: Direction | null
  /** Free text: "a mix of 1 and 3", or their own direction. */
  customDirection: string
  themes: string[]
  style: StyleChoice | null
  customStyle: string
  elements: string[]
  characters: PatchCharacter[]
  extra: string
}

export const LENGTHS: Record<Spark['length'], { label: string; chapters: string }> = {
  short: { label: 'Short', chapters: '3–5' },
  novella: { label: 'Novella', chapters: '6–10' },
  novel: { label: 'Novel', chapters: '12–20' },
}
export const DENSITIES: Record<Spark['density'], { label: string; beats: string }> = {
  lean: { label: 'Lean', beats: '3–4' },
  rich: { label: 'Rich', beats: '5–7' },
  lush: { label: 'Lush', beats: '7–10' },
}

export type AiRequest =
  | { kind: 'spark'; spark: Spark; avoid?: string[] }
  | { kind: 'outline'; spark: Spark; picks: Picks | null }
  | { kind: 'brainstorm'; chapterId: string; focus: string }
  | { kind: 'weave'; storyId: string; ideas: Idea[]; extra: string }
  | { kind: 'story'; storyId: string; instruction: string; includeOutline: boolean }
  | { kind: 'character'; characterId: string; instruction: string }
  | { kind: 'new-character'; idea: string; storyId: string | null }
  | { kind: 'chapter'; chapterId: string; instruction: string }
  | { kind: 'beat'; beatId: string; instruction: string }

/* ───────────────────────────── Serialisers ───────────────────────────── */

const omitEmpty = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))) as Partial<T>

function storyJson(s: Story) {
  return omitEmpty({ id: s.id, title: s.title, logline: s.logline, premise: s.premise, genre: s.genre, heat: s.heat, pov: s.pov, tense: s.tense, style: s.style, contentRules: s.contentRules, world: s.world, themes: s.themes, tags: s.tags })
}

function characterJson(c: Character, story?: Story, full = true) {
  const cast = story?.cast.find((m) => m.characterId === c.id)
  return omitEmpty({
    id: c.id,
    name: c.name,
    aka: c.aka,
    pronouns: c.pronouns,
    age: c.age,
    tagline: c.tagline,
    ...(full
      ? {
          tags: c.tags,
          appearance: c.appearance.filter((t) => t.value).map((t) => ({ label: t.label, value: t.value, essential: t.essential })),
          personality: c.personality,
          voice: c.voice,
          sampleLines: c.sampleLines.filter(Boolean),
          motivations: c.motivations,
          desires: c.desires,
          boundaries: c.boundaries,
          backstory: c.backstory,
        }
      : {}),
    role: cast?.role,
    storyNotes: cast?.storyNotes,
  })
}

function relationshipJson(r: Relationship, names: Map<string, string>) {
  return omitEmpty({ between: r.characterIds.map((id) => names.get(id) ?? id), label: r.label, dynamic: r.dynamic, history: r.history, tension: r.tension, consent: r.consent })
}

function beatJson(b: Beat, names: Map<string, string>) {
  return omitEmpty({
    id: b.id,
    title: b.title,
    description: b.description,
    emotion: b.emotion,
    tone: b.tone,
    pacing: b.pacing,
    mustInclude: b.mustInclude,
    mustAvoid: b.mustAvoid,
    characters: b.characterIds.map((id) => names.get(id) ?? id),
    targetWords: b.targetWords,
    status: b.status,
    recap: b.recap,
  })
}

function chapterJson(ch: Chapter, beats: Beat[] | null, names: Map<string, string>) {
  return omitEmpty({
    id: ch.id,
    title: ch.title,
    purpose: ch.purpose,
    summary: ch.summary,
    setting: ch.setting,
    pov: ch.povCharacterId ? names.get(ch.povCharacterId) : undefined,
    characters: ch.characterIds.map((id) => names.get(id) ?? id),
    ...(beats ? { beats: beats.map((b) => beatJson(b, names)) } : {}),
  })
}

const block = (v: unknown) => '```json\n' + JSON.stringify(v, null, 2) + '\n```'

/* ───────────────────────────── Reply format ───────────────────────────── */

const FORMAT = `{
  "story": {            // optional
    "id": "...",        // keep if editing the existing story
    "title": "", "logline": "", "premise": "", "genre": "",
    "heat": "",         // how explicit, e.g. "Slow burn → explicit"
    "pov": "", "tense": "past" | "present",
    "style": "",        // prose style guide for the writing AI
    "contentRules": "", // story-wide always / never
    "world": "", "themes": [], "tags": []
  },
  "characters": [       // optional; matched to existing characters by id, then name
    {
      "id": "...", "name": "", "aka": "", "pronouns": "", "age": "",
      "tagline": "",    // one-line essence — the most important field
      "appearance": [ { "label": "Build", "value": "", "essential": true } ],
      "personality": "", "voice": "",   // voice = how they talk
      "sampleLines": [""],              // 2–4 lines of dialogue only they would say
      "motivations": "", "desires": "", "boundaries": "", "backstory": "",
      "tags": [],
      "role": "",        // role in this story, e.g. "Love interest"
      "storyNotes": ""   // anything true only in this story
    }
  ],
  "relationships": [    // optional
    { "between": ["Name A", "Name B"], "label": "", "dynamic": "", "history": "", "tension": "", "consent": "" }
  ],
  "chapters": [         // optional; matched by id, then title
    {
      "id": "...", "title": "", "purpose": "", "summary": "", "setting": "",
      "pov": "Character name", "characters": ["Name"],
      "after": "...",   // NEW chapters only: id or title of the chapter it follows, or "start"
      "beatsMode": "merge" | "replace",
      "beats": [
        { "id": "...", "title": "", "description": "", "emotion": "", "tone": "", "pacing": "",
          "mustInclude": "", "mustAvoid": "", "characters": ["Name"], "targetWords": 900,
          "after": "...",      // NEW beats only: id or title of the beat it follows, or "start"
          "optional": false,   // true = a suggestion the writer can opt into
          "why": "" }          // one line: why this beat / change
      ]
    }
  ],
  "notes": ""           // optional: anything you want to tell me (not imported)
}`

function replyRules(mode: 'create' | 'edit'): string {
  const common = [
    'Reply with exactly ONE ```json code block in the format above. No other text before it; if you have comments, put them in "notes".',
    'It must be valid JSON: double quotes, no trailing commas, no comments. Use \\n for line breaks inside strings.',
    'Refer to characters by their exact name everywhere (pov, characters, between).',
    'Write field values as planning notes for a novelist — specific, concrete, vivid. Not prose, not generic.',
    'A beat is one movement of a scene (a glance, a decision, a confession), not a whole scene. "emotion" says what each person feels going in and coming out.',
    'Use "optional": true for beats that are good suggestions but not essential, and give every new beat a short "why".',
  ]
  const edit = [
    'Keep the "id" of every existing item you change. Leave "id" out for new items.',
    'Only include the items and fields you are changing or adding — everything you leave out stays as it is.',
    'For a chapter\'s beats: "beatsMode": "merge" (default) updates/adds only the beats you list; use "replace" only if you are giving the complete new beat list for that chapter (beats you leave out will be deleted).',
  ]
  const create = ['Fill in every field you can — this is the first draft of the whole plan, and depth now saves work later.', 'Leave out "id" for new things. Keep the "id" of the story and of any characters I gave you with ids (you may enrich them).']
  return [...common, ...(mode === 'edit' ? edit : create)].map((r) => `- ${r}`).join('\n')
}

function assemble(title: string, ask: string, context: Array<[string, unknown]>, mode: 'create' | 'edit'): string {
  const parts = [
    `# Trellis request: ${title}`,
    'You are a story-development partner helping me plan long-form, character-driven adult fiction. I plan in an app called Trellis (characters → story → chapters → beats); the prose gets written later from this plan. Your reply will be imported straight into the app, so the format matters.',
    `## What I want\n\n${ask.trim() || '(See context.)'}`,
    ...context.map(([h, v]) => `## ${h}\n\n${block(v)}`),
    `## Reply format\n\n\`\`\`\n${FORMAT}\n\`\`\``,
    `## Rules\n\n${replyRules(mode)}`,
  ]
  return parts.join('\n\n') + '\n'
}

const OPTIONS_FORMAT = `{
  "directions": [   // 4 distinct takes on the story
    { "title": "", "description": "2–3 sentence pitch", "logline": "", "premise": "", "genre": "", "heat": "" }
  ],
  "themes": [ { "title": "", "description": "" } ],          // 8
  "styles": [       // 4 clearly different prose styles
    { "title": "", "description": "a usable style guide", "pov": "", "tense": "past" | "present",
      "sample": "a 3–5 sentence paragraph from THIS story, written in this style" }
  ],
  "elements": [ { "title": "", "description": "" } ],        // 10–12: set pieces, tropes, dynamics, motifs, key moments
  "characters": [   // 4–6 concepts (skip any I already gave you)
    { "name": "", "pronouns": "", "age": "", "tagline": "", "role": "", "personality": "", "desires": "" }
  ]
}`

const sparkShape = (spark: Spark) =>
  `${LENGTHS[spark.length].label} length: ${LENGTHS[spark.length].chapters} chapters, about ${DENSITIES[spark.density].beats} beats each.${spark.heat ? ` Heat: ${spark.heat}.` : ''}`

/** Compact outline for weaving: enough to place things, small enough to stay reliable. */
function outlineJson(chapters: Chapter[], beatsOf: (id: string) => Beat[], hasProse: (id: string) => boolean) {
  return chapters.map((ch, i) =>
    omitEmpty({
      id: ch.id,
      chapter: i + 1,
      title: ch.title,
      purpose: ch.purpose,
      beats: beatsOf(ch.id).map((b) =>
        omitEmpty({ id: b.id, title: b.title, description: b.description.length > 220 ? `${b.description.slice(0, 219)}…` : b.description, written: hasProse(b.id) || undefined }),
      ),
    }),
  )
}

/* ───────────────────────────── Builders ───────────────────────────── */

export function buildAiRequest(req: AiRequest, state: DataState): { title: string; prompt: string; targetStoryId: string | null } {
  const names = new Map(state.characters.map((c) => [c.id, c.name]))
  const charById = new Map(state.characters.map((c) => [c.id, c]))
  const chaptersOf = (storyId: string) => state.chapters.filter((c) => c.storyId === storyId).sort((a, b) => a.order - b.order)
  const beatsOf = (chapterId: string) => state.beats.filter((b) => b.chapterId === chapterId).sort((a, b) => a.order - b.order)
  const relsAmong = (ids: string[]) => state.relationships.filter((r) => ids.includes(r.characterIds[0]) && ids.includes(r.characterIds[1]))

  switch (req.kind) {
    case 'spark': {
      const chars = req.spark.characterIds.map((id) => charById.get(id)).filter((c): c is Character => !!c)
      const existing = req.spark.storyId ? state.stories.find((x) => x.id === req.spark.storyId) : undefined
      const ask = [
        req.spark.text.trim(),
        existing ? 'This story already exists — its bible is below. Give options for how to TELL it: ways it could unfold (as "directions"), themes, prose styles, story elements, and any extra characters it needs. Stay consistent with the bible.' : '',
        '',
        `Don't write the plan yet. Give me OPTIONS to choose from, so I can shape the story before it's outlined. ${sparkShape(req.spark)}`,
        'Make the options genuinely different from each other — range from the expected to the surprising. Keep them true to my spark.',
        req.avoid?.length ? `I've already seen these — give me fresh alternatives instead: ${req.avoid.join('; ')}.` : '',
      ]
        .filter((l) => l !== undefined)
        .join('\n')
      const parts = [
        `# Trellis request: brainstorm options for ${existing ? `“${existing.title || 'my story'}”` : 'a new story'}`,
        'You are a story-development partner helping me plan long-form, character-driven adult fiction. I plan in an app called Trellis; I will pick from your options and then ask you for the full outline.',
        `## My spark\n\n${ask.trim()}`,
        ...(existing ? [`## The story so far (bible)\n\n${block(storyJson(existing))}`] : []),
        ...(chars.length ? [`## Characters I want to use\n\n${block(chars.map((c) => characterJson(c, existing, false)))}`] : []),
        `## Reply format\n\n\`\`\`\n${OPTIONS_FORMAT}\n\`\`\``,
        '## Rules\n\n- Reply with exactly ONE ```json code block in the format above, nothing else.\n- Valid JSON: double quotes, no trailing commas, no comments.\n- Be specific and vivid; avoid generic options.',
      ]
      return { title: 'Story options', targetStoryId: existing?.id ?? null, prompt: parts.join('\n\n') + '\n' }
    }

    case 'outline': {
      const { spark, picks } = req
      const chars = spark.characterIds.map((id) => charById.get(id)).filter((c): c is Character => !!c)
      const existing = spark.storyId ? state.stories.find((x) => x.id === spark.storyId) : undefined
      const lines = [
        spark.text.trim(),
        '',
        picks?.direction ? `Direction I chose: “${picks.direction.title}” — ${picks.direction.logline || picks.direction.description}\n${picks.direction.premise}` : '',
        picks?.customDirection ? `My notes on the direction: ${picks.customDirection}` : '',
        picks?.themes.length ? `Themes to explore: ${picks.themes.join('; ')}.` : '',
        picks?.style ? `Prose style I chose: “${picks.style.title}” — ${picks.style.description}${picks.style.pov ? ` POV: ${picks.style.pov}.` : ''}${picks.style.tense ? ` Tense: ${picks.style.tense}.` : ''}` : '',
        picks?.customStyle ? `Style notes: ${picks.customStyle}` : '',
        picks?.elements.length ? `Elements that must be in the story (place each where it works best):\n${picks.elements.map((e) => `- ${e}`).join('\n')}` : '',
        picks?.extra ? `Also: ${picks.extra}` : '',
        '',
        existing
          ? `Now build the full outline for this existing story (bible below): chapters and beats. ${sparkShape(spark)} Keep the story's "id"; include only the story fields you are genuinely improving (e.g. "style" or "themes" from my picks). Keep existing characters and their ids; add new characters and relationships only if the story needs them.`
          : `Now build the complete plan: the story bible (including a detailed "style" guide and "themes"), every character in full depth, the key relationships, and the full outline. ${sparkShape(spark)}`,
        'For every chapter, also add 1–3 extra beats marked "optional": true with a "why" — alternatives or extra moments I can opt into.',
        chars.length ? `Use these existing characters (keep their ids and names): ${chars.map((c) => c.name).join(', ')}.` : '',
      ].filter(Boolean)
      const context: Array<[string, unknown]> = []
      if (existing) {
        context.push(['The story (existing — keep its id)', storyJson(existing)])
        const rels = relsAmong(chars.map((c) => c.id))
        if (rels.length) context.push(['Relationships', rels.map((r) => relationshipJson(r, names))])
      }
      if (chars.length) context.push([existing ? 'Cast (keep their ids)' : 'Existing characters to use', chars.map((c) => characterJson(c, existing))])
      if (picks?.characters.length) context.push(['Character concepts I chose (develop them fully)', picks.characters])
      return {
        title: existing ? `Outline “${existing.title || 'Untitled story'}”` : 'Plan a new story',
        targetStoryId: existing?.id ?? null,
        prompt: assemble(existing ? `outline the story “${existing.title || 'Untitled'}”` : 'build the full plan for a new story', lines.join('\n'), context, 'create'),
      }
    }

    case 'brainstorm': {
      const ch = state.chapters.find((c) => c.id === req.chapterId)
      if (!ch) throw new Error('Chapter not found')
      const story = state.stories.find((s) => s.id === ch.storyId)!
      const all = chaptersOf(story.id)
      const i = all.findIndex((c) => c.id === ch.id)
      const castIds = story.cast.map((m) => m.characterId)
      const ask = [
        req.focus.trim() ? `Focus: ${req.focus.trim()}` : '',
        `Brainstorm 8–12 candidate beats for chapter ${i + 1}${ch.title ? ` (“${ch.title}”)` : ''}: new moments, complications, reversals, intimate beats, quiet character beats. Range from the obvious to the surprising.`,
        'Return them as new beats of this chapter (beatsMode "merge"), each with "after" (the id of the beat it should follow, or "start") and a one-line "why".',
        'Mark your 3–5 strongest with "optional": false and the rest "optional": true — I will choose which to keep.',
        'Do not change existing beats.',
      ]
        .filter(Boolean)
        .join('\n')
      return {
        title: `Brainstorm chapter ${i + 1}`,
        targetStoryId: story.id,
        prompt: assemble(
          `brainstorm beats for chapter ${i + 1}`,
          ask,
          [
            ['The story', storyJson(story)],
            ['Cast', castIds.map((id) => charById.get(id)).filter((c): c is Character => !!c).map((c) => characterJson(c, story, false))],
            ['Relationships', relsAmong(castIds).map((r) => relationshipJson(r, names))],
            ['Whole outline (for context)', outlineJson(all, beatsOf, (id) => !!state.beatsWithProse?.has(id))],
            ['This chapter', chapterJson(ch, beatsOf(ch.id), names)],
          ],
          'edit',
        ),
      }
    }

    case 'weave': {
      const story = state.stories.find((s) => s.id === req.storyId)
      if (!story) throw new Error('Story not found')
      const castIds = story.cast.map((m) => m.characterId)
      const ideas = req.ideas.map((x, n) => `${n + 1}. ${x.kind === 'change' ? '[CHANGE] ' : ''}${x.text}`).join('\n')
      const ask = [
        'Weave these into the outline, each where it fits best in the story:',
        ideas,
        req.extra.trim() ? `\nAlso: ${req.extra.trim()}` : '',
        '',
        'How:',
        '- Prefer adding new beats, placed with "after" (the id of the beat they follow, or "start"). Put them in the chapter where they belong.',
        '- Adjust existing beats only where needed to make an idea land or stay consistent — keep their ids and include only the fields you change.',
        '- [CHANGE] items describe something already decided: update every chapter and beat that now contradicts it.',
        '- If an idea needs its own space, add a new chapter with "after".',
        '- Never delete beats. Beats marked "written" already have prose — change them only if truly necessary.',
        '- Give every new or changed beat a "why" that names the idea it serves. If an idea doesn’t fit, explain in "notes".',
      ]
        .filter((l) => l !== '')
        .join('\n')
      return {
        title: `Weave ${req.ideas.length} idea${req.ideas.length === 1 ? '' : 's'} in`,
        targetStoryId: story.id,
        prompt: assemble(
          'weave ideas into the outline',
          ask,
          [
            ['The story', storyJson(story)],
            ['Cast', castIds.map((id) => charById.get(id)).filter((c): c is Character => !!c).map((c) => characterJson(c, story, false))],
            ['Relationships', relsAmong(castIds).map((r) => relationshipJson(r, names))],
            ['Outline', outlineJson(chaptersOf(story.id), beatsOf, (id) => !!state.beatsWithProse?.has(id))],
          ],
          'edit',
        ),
      }
    }

    case 'story': {
      const story = state.stories.find((s) => s.id === req.storyId)
      if (!story) throw new Error('Story not found')
      const castIds = story.cast.map((m) => m.characterId)
      const cast = castIds.map((id) => charById.get(id)).filter((c): c is Character => !!c)
      const chapters = chaptersOf(story.id)
      return {
        title: `Edit “${story.title || 'Untitled story'}”`,
        targetStoryId: story.id,
        prompt: assemble(
          `edit the story “${story.title || 'Untitled'}”`,
          req.instruction,
          [
            ['The story', storyJson(story)],
            ['Cast', cast.map((c) => characterJson(c, story, req.includeOutline))],
            ['Relationships', relsAmong(castIds).map((r) => relationshipJson(r, names))],
            ['Outline', chapters.map((ch) => chapterJson(ch, req.includeOutline ? beatsOf(ch.id) : null, names))],
          ],
          'edit',
        ),
      }
    }

    case 'character': {
      const c = charById.get(req.characterId)
      if (!c) throw new Error('Character not found')
      const rels = state.relationships.filter((r) => r.characterIds.includes(c.id))
      return {
        title: `Edit ${c.name || 'character'}`,
        targetStoryId: null,
        prompt: assemble(
          `develop the character ${c.name}`,
          req.instruction,
          [
            ['The character', characterJson(c)],
            ...(rels.length ? [['Their relationships', rels.map((r) => relationshipJson(r, names))] as [string, unknown]] : []),
          ],
          'edit',
        ),
      }
    }

    case 'new-character': {
      const story = req.storyId ? state.stories.find((s) => s.id === req.storyId) : undefined
      const cast = story ? story.cast.map((m) => charById.get(m.characterId)).filter((c): c is Character => !!c) : []
      return {
        title: 'Create a character',
        targetStoryId: story?.id ?? null,
        prompt: assemble(
          'create a character',
          `${req.idea.trim()}\n\nCreate this character in full depth. ${story ? 'Give them a "role" in the story below, and add relationships with the existing cast where it matters.' : ''}`,
          story
            ? [
                ['The story', storyJson(story)],
                ['Existing cast (for context; don’t change them)', cast.map((c) => characterJson(c, story, false))],
              ]
            : [],
          'create',
        ),
      }
    }

    case 'chapter': {
      const ch = state.chapters.find((c) => c.id === req.chapterId)
      if (!ch) throw new Error('Chapter not found')
      const story = state.stories.find((s) => s.id === ch.storyId)!
      const all = chaptersOf(story.id)
      const i = all.findIndex((c) => c.id === ch.id)
      const castIds = story.cast.map((m) => m.characterId)
      return {
        title: `Edit chapter ${i + 1}`,
        targetStoryId: story.id,
        prompt: assemble(
          `work on chapter ${i + 1}${ch.title ? ` (“${ch.title}”)` : ''}`,
          req.instruction,
          [
            ['The story', storyJson(story)],
            ['Cast', castIds.map((id) => charById.get(id)).filter((c): c is Character => !!c).map((c) => characterJson(c, story, false))],
            ['Relationships', relsAmong(castIds).map((r) => relationshipJson(r, names))],
            ['Other chapters (context only)', all.filter((c) => c.id !== ch.id).map((c) => ({ title: c.title, purpose: c.purpose, summary: c.summary, position: all.indexOf(c) + 1 }))],
            ['This chapter', chapterJson(ch, beatsOf(ch.id), names)],
          ],
          'edit',
        ),
      }
    }

    case 'beat': {
      const b = state.beats.find((x) => x.id === req.beatId)
      if (!b) throw new Error('Beat not found')
      const ch = state.chapters.find((c) => c.id === b.chapterId)!
      const story = state.stories.find((s) => s.id === b.storyId)!
      const siblings = beatsOf(ch.id)
      const castIds = story.cast.map((m) => m.characterId)
      return {
        title: `Edit beat “${b.title || 'untitled'}”`,
        targetStoryId: story.id,
        prompt: assemble(
          `refine one beat`,
          `${req.instruction}\n\nReturn the chapter with "id" "${ch.id}" containing only this beat (id "${b.id}") — plus any new beats if I asked for them.`,
          [
            ['The story', storyJson(story)],
            ['Cast', castIds.map((id) => charById.get(id)).filter((c): c is Character => !!c).map((c) => characterJson(c, story, false))],
            ['The chapter', { ...chapterJson(ch, null, names), beats: siblings.map((s) => (s.id === b.id ? beatJson(s, names) : { id: s.id, title: s.title, description: s.description })) }],
            ['The beat to refine', beatJson(b, names)],
          ],
          'edit',
        ),
      }
    }
  }
}
