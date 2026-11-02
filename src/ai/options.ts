import { extractJson, isObj, normalisePatch, pick, repairJson, str, type Obj, type PatchCharacter } from './patch'

/**
 * The "menu" format: instead of one answer, the AI proposes several options
 * per dimension, and the writer picks. Used by the story builder.
 */

export interface Choice {
  id: string
  title: string
  description: string
}

export interface Direction extends Choice {
  logline: string
  premise: string
  genre: string
  heat: string
}

export interface StyleChoice extends Choice {
  /** A short paragraph written in this style, so the writer can *hear* it. */
  sample: string
  pov: string
  tense: string
}

export interface CharacterConcept extends Choice {
  character: PatchCharacter
}

export interface StoryOptions {
  directions: Direction[]
  themes: Choice[]
  styles: StyleChoice[]
  elements: Choice[]
  characters: CharacterConcept[]
}

export const emptyOptions = (): StoryOptions => ({ directions: [], themes: [], styles: [], elements: [], characters: [] })

let seq = 0
const cid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`

function choices(v: unknown, prefix: string): Choice[] {
  const arr = Array.isArray(v) ? v : isObj(v) ? Object.entries(v).map(([k, x]) => (isObj(x) ? { title: k, ...x } : { title: k, description: str(x) })) : []
  return arr
    .map((x) => {
      if (typeof x === 'string') {
        const m = /^([^:–—-]{2,60})[:–—-]\s*(.+)$/.exec(x)
        return { id: cid(prefix), title: (m?.[1] ?? x).trim(), description: (m?.[2] ?? '').trim() }
      }
      if (!isObj(x)) return null
      return {
        id: cid(prefix),
        title: str(pick(x, 'title', 'name', 'theme', 'label')) ?? '',
        description: str(pick(x, 'description', 'summary', 'detail', 'why', 'pitch')) ?? '',
      }
    })
    .filter((c): c is Choice => !!c && !!c.title)
}

export function parseOptions(reply: string): { options: StoryOptions | null; error?: string } {
  const raw = extractJson(reply)
  if (!raw) return { options: null, error: 'Couldn’t find any JSON in that reply. Copy the whole reply, including the ```json block.' }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    try {
      data = JSON.parse(repairJson(raw))
    } catch (e) {
      return { options: null, error: `The JSON is broken (${e instanceof Error ? e.message : 'parse error'}). Ask the AI to “resend valid JSON only”.` }
    }
  }
  const root: Obj = isObj(data) ? (isObj(pick(data, 'options')) ? (pick(data, 'options') as Obj) : data) : {}

  const directions: Direction[] = (Array.isArray(pick(root, 'directions', 'concepts', 'pitches', 'stories')) ? (pick(root, 'directions', 'concepts', 'pitches', 'stories') as unknown[]) : [])
    .filter(isObj)
    .map((d) => ({
      id: cid('dir_'),
      title: str(pick(d, 'title', 'name')) ?? 'Untitled direction',
      description: str(pick(d, 'description', 'pitch', 'hook', 'summary')) ?? '',
      logline: str(pick(d, 'logline')) ?? '',
      premise: str(pick(d, 'premise', 'synopsis', 'arc')) ?? '',
      genre: str(pick(d, 'genre')) ?? '',
      heat: str(pick(d, 'heat', 'heatLevel')) ?? '',
    }))

  const styles: StyleChoice[] = (Array.isArray(pick(root, 'styles', 'proseStyles', 'voices')) ? (pick(root, 'styles', 'proseStyles', 'voices') as unknown[]) : [])
    .filter(isObj)
    .map((s) => ({
      id: cid('sty_'),
      title: str(pick(s, 'title', 'name')) ?? 'Style',
      description: str(pick(s, 'description', 'guide', 'style', 'styleGuide')) ?? '',
      sample: str(pick(s, 'sample', 'example', 'samplePassage', 'excerpt')) ?? '',
      pov: str(pick(s, 'pov', 'pointOfView')) ?? '',
      tense: str(pick(s, 'tense')) ?? '',
    }))

  // Characters reuse the patch normaliser so every field alias works.
  const charSrc = pick(root, 'characters', 'characterConcepts', 'cast')
  const patchChars = normalisePatch({ characters: charSrc }, []).characters
  const characters: CharacterConcept[] = patchChars.map((c) => ({
    id: cid('chr_'),
    title: c.name,
    description: c.tagline || c.role || '',
    character: c,
  }))

  const options: StoryOptions = {
    directions,
    themes: choices(pick(root, 'themes'), 'thm_'),
    styles,
    elements: choices(pick(root, 'elements', 'tropes', 'setPieces', 'ingredients', 'moments'), 'el_'),
    characters,
  }
  const count = options.directions.length + options.themes.length + options.styles.length + options.elements.length + options.characters.length
  if (!count) return { options: null, error: 'The reply didn’t contain any options (directions, themes, styles, elements or characters).' }
  return { options }
}

/** Append new options to existing ones, skipping near-duplicate titles. */
export function mergeOptions(a: StoryOptions, b: StoryOptions): StoryOptions {
  const merge = <T extends Choice>(x: T[], y: T[]) => {
    const seen = new Set(x.map((i) => i.title.toLowerCase().trim()))
    return [...x, ...y.filter((i) => !seen.has(i.title.toLowerCase().trim()))]
  }
  return {
    directions: merge(a.directions, b.directions),
    themes: merge(a.themes, b.themes),
    styles: merge(a.styles, b.styles),
    elements: merge(a.elements, b.elements),
    characters: merge(a.characters, b.characters),
  }
}
