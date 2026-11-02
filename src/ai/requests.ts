import type { Beat, Chapter, Character, Relationship, Story } from '@/db/types'
import type { DataState } from './plan'

/**
 * Prompts that ask an external AI to *generate or edit planning data* (as
 * opposed to export/, which asks it to write prose). Every request:
 *   1. says what the writer wants, in their words,
 *   2. includes the relevant current data as JSON, with ids,
 *   3. specifies the exact reply format, so the reply can be pasted straight
 *      back into Trellis and previewed as a set of changes.
 */

export type AiRequest =
  | { kind: 'new-story'; overview: string; characterIds: string[]; chapters: number | null; beatsPerChapter: string }
  | { kind: 'story'; storyId: string; instruction: string; includeOutline: boolean }
  | { kind: 'character'; characterId: string; instruction: string }
  | { kind: 'new-character'; idea: string; storyId: string | null }
  | { kind: 'chapter'; chapterId: string; instruction: string }
  | { kind: 'beat'; beatId: string; instruction: string }

/* ───────────────────────────── Serialisers ───────────────────────────── */

const omitEmpty = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))) as Partial<T>

function storyJson(s: Story) {
  return omitEmpty({ id: s.id, title: s.title, logline: s.logline, premise: s.premise, genre: s.genre, heat: s.heat, pov: s.pov, tense: s.tense, style: s.style, contentRules: s.contentRules, world: s.world, tags: s.tags })
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
    "world": "", "tags": []
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
      "beatsMode": "merge" | "replace",
      "beats": [
        { "id": "...", "title": "", "description": "", "emotion": "", "tone": "", "pacing": "",
          "mustInclude": "", "mustAvoid": "", "characters": ["Name"], "targetWords": 900 }
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
  ]
  const edit = [
    'Keep the "id" of every existing item you change. Leave "id" out for new items.',
    'Only include the items and fields you are changing or adding — everything you leave out stays as it is.',
    'For a chapter\'s beats: "beatsMode": "merge" (default) updates/adds only the beats you list; use "replace" only if you are giving the complete new beat list for that chapter (beats you leave out will be deleted).',
  ]
  const create = ['Fill in every field you can — this is the first draft of the whole plan, and depth now saves work later.', 'Do not include "id" fields; everything is new (except characters I gave you with ids, which you may keep and enrich).']
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

/* ───────────────────────────── Builders ───────────────────────────── */

export function buildAiRequest(req: AiRequest, state: DataState): { title: string; prompt: string; targetStoryId: string | null } {
  const names = new Map(state.characters.map((c) => [c.id, c.name]))
  const charById = new Map(state.characters.map((c) => [c.id, c]))
  const chaptersOf = (storyId: string) => state.chapters.filter((c) => c.storyId === storyId).sort((a, b) => a.order - b.order)
  const beatsOf = (chapterId: string) => state.beats.filter((b) => b.chapterId === chapterId).sort((a, b) => a.order - b.order)
  const relsAmong = (ids: string[]) => state.relationships.filter((r) => ids.includes(r.characterIds[0]) && ids.includes(r.characterIds[1]))

  switch (req.kind) {
    case 'new-story': {
      const chars = req.characterIds.map((id) => charById.get(id)).filter((c): c is Character => !!c)
      const shape = [
        req.chapters ? `${req.chapters} chapters` : 'as many chapters as the story needs (usually 6–12)',
        `${req.beatsPerChapter || '3–6'} beats per chapter`,
      ].join(', ')
      const ask = [
        req.overview.trim(),
        '',
        `Build the complete plan: the story bible, every character (new ones in full depth; enrich the existing ones I've given only where this story needs it, via "storyNotes"), the key relationships, and an outline of ${shape}.`,
        chars.length ? `Use these existing characters (keep their ids and names): ${chars.map((c) => c.name).join(', ')}.` : 'Create the characters the story needs.',
      ].join('\n')
      return {
        title: 'Plan a new story',
        targetStoryId: null,
        prompt: assemble(
          'plan a new story',
          ask,
          chars.length ? [['Existing characters to use', chars.map((c) => characterJson(c))], ...(relsAmong(req.characterIds).length ? [['Their existing relationships', relsAmong(req.characterIds).map((r) => relationshipJson(r, names))] as [string, unknown]] : [])] : [],
          'create',
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
