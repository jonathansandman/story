import { newId } from '@/lib/id'
import type { Beat, Chapter, Character, ExportOptions, Relationship, Story, Trait } from './types'

/**
 * Factories produce fully-populated rows so the rest of the app never has to
 * handle `undefined` fields. Adding a field = add a default here.
 */

export const CHARACTER_COLORS = [
  '#9b4d5f', // wine
  '#4f6f8f', // slate blue
  '#5f7f5a', // sage
  '#a0703a', // amber
  '#6f5a8f', // plum
  '#3f7f7a', // teal
  '#8f5a3f', // terracotta
] as const

export function makeTrait(partial: Partial<Trait> = {}): Trait {
  return { id: newId('t_'), label: '', value: '', essential: false, ...partial }
}

export function makeCharacter(partial: Partial<Character> = {}): Character {
  const now = Date.now()
  const color = CHARACTER_COLORS[Math.floor(Math.random() * CHARACTER_COLORS.length)] ?? '#9b4d5f'
  return {
    id: newId('c_'),
    name: '',
    aka: '',
    pronouns: '',
    age: '',
    tagline: '',
    color,
    tags: [],
    appearance: [
      makeTrait({ label: 'Build', essential: true }),
      makeTrait({ label: 'Face', essential: true }),
      makeTrait({ label: 'Hair' }),
      makeTrait({ label: 'Style' }),
    ],
    personality: '',
    voice: '',
    sampleLines: [],
    motivations: '',
    desires: '',
    boundaries: '',
    backstory: '',
    notes: '',
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export function makeRelationship(a: string, b: string, partial: Partial<Relationship> = {}): Relationship {
  const now = Date.now()
  return {
    id: newId('r_'),
    characterIds: sortPair(a, b),
    label: '',
    dynamic: '',
    history: '',
    tension: '',
    consent: '',
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export function sortPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

export function makeStory(partial: Partial<Story> = {}): Story {
  const now = Date.now()
  return {
    id: newId('s_'),
    title: '',
    logline: '',
    premise: '',
    genre: '',
    heat: '',
    pov: '',
    tense: 'past',
    style: '',
    contentRules: '',
    world: '',
    status: 'seed',
    tags: [],
    cast: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export function makeChapter(storyId: string, order: number, partial: Partial<Chapter> = {}): Chapter {
  const now = Date.now()
  return {
    id: newId('ch_'),
    storyId,
    order,
    title: '',
    purpose: '',
    summary: '',
    povCharacterId: null,
    characterIds: [],
    setting: '',
    notes: '',
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export function makeBeat(storyId: string, chapterId: string, order: number, partial: Partial<Beat> = {}): Beat {
  const now = Date.now()
  return {
    id: newId('b_'),
    storyId,
    chapterId,
    order,
    title: '',
    description: '',
    emotion: '',
    tone: '',
    pacing: '',
    mustInclude: '',
    mustAvoid: '',
    characterIds: [],
    targetWords: null,
    recap: '',
    status: 'idea',
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: 'markdown',
  characterDetail: 'standard',
  includeStory: true,
  includeTask: true,
  includeContinuity: true,
  includeNextBeat: true,
  includeRelationships: true,
  includeWriterNotes: false,
  extraInstructions: '',
}
