/**
 * The AI exchange format.
 *
 * Trellis asks an external model (Grok, Claude, ChatGPT…) to reply with one
 * JSON object in this shape. Everything is optional; the model only includes
 * what it's creating or changing. Entities are matched to existing data by
 * `id` first, then by name/title, so a model that drops ids still works.
 *
 * Parsing is deliberately forgiving: models wrap JSON in prose and code
 * fences, add trailing commas, use smart quotes, write numbers as strings,
 * or return appearance as an object instead of a list. We normalise all of
 * that here so the rest of the pipeline sees clean, typed data.
 */

export interface PatchTrait {
  label: string
  value: string
  essential: boolean
}

export interface PatchStory {
  id?: string
  title?: string
  logline?: string
  premise?: string
  genre?: string
  heat?: string
  pov?: string
  tense?: 'past' | 'present' | ''
  style?: string
  contentRules?: string
  world?: string
  tags?: string[]
}

export interface PatchCharacter {
  id?: string
  name: string
  aka?: string
  pronouns?: string
  age?: string
  tagline?: string
  tags?: string[]
  appearance?: PatchTrait[]
  personality?: string
  voice?: string
  sampleLines?: string[]
  motivations?: string
  desires?: string
  boundaries?: string
  backstory?: string
  /** Story-specific: their role in the target story (adds them to the cast). */
  role?: string
  /** Story-specific overlay for the target story. */
  storyNotes?: string
}

export interface PatchRelationship {
  between: [string, string]
  label?: string
  dynamic?: string
  history?: string
  tension?: string
  consent?: string
}

export interface PatchBeat {
  id?: string
  title?: string
  description?: string
  emotion?: string
  tone?: string
  pacing?: string
  mustInclude?: string
  mustAvoid?: string
  /** Character names (or ids). */
  characters?: string[]
  targetWords?: number | null
}

export interface PatchChapter {
  id?: string
  title?: string
  purpose?: string
  summary?: string
  setting?: string
  /** POV character name (or id). */
  pov?: string
  characters?: string[]
  /**
   * merge (default): update/add the listed beats, keep the rest.
   * replace: the listed beats become the chapter's full beat list.
   */
  beatsMode?: 'merge' | 'replace'
  beats?: PatchBeat[]
}

export interface TrellisPatch {
  story?: PatchStory
  characters: PatchCharacter[]
  relationships: PatchRelationship[]
  chapters: PatchChapter[]
  /** Free-text notes the model added (shown to the user, never applied). */
  notes?: string
}

export interface ParseResult {
  patch: TrellisPatch | null
  warnings: string[]
  error?: string
}

/* ───────────────────────────── Extraction ───────────────────────────── */

/**
 * Pull the JSON object out of a model reply. Prefers a ```json fence, then any
 * fence containing an object, then the outermost {...} in the text.
 */
export function extractJson(reply: string): string | null {
  const fences = [...reply.matchAll(/```[ \t]*([a-zA-Z0-9]*)[ \t]*\n([\s\S]*?)```/g)]
  const jsonFence = fences.find((m) => m[1]?.toLowerCase() === 'json') ?? fences.find((m) => m[2]?.trim().startsWith('{'))
  if (jsonFence?.[2]) return jsonFence[2].trim()
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  return start >= 0 && end > start ? reply.slice(start, end + 1) : null
}

/** Repairs the most common model JSON mistakes without a full JSON5 parser. */
export function repairJson(src: string): string {
  return (
    src
      // smart quotes used as JSON delimiters
      .replace(/[“”]/g, '"')
      // // line comments (only at line start or after whitespace, to spare URLs in strings)
      .replace(/(^|\s)\/\/[^\n]*/g, '$1')
      // trailing commas
      .replace(/,\s*([}\]])/g, '$1')
  )
}

export function parseReply(reply: string): ParseResult {
  const raw = extractJson(reply)
  if (!raw) return { patch: null, warnings: [], error: 'Couldn’t find any JSON in that text. Make sure you copied the whole reply, including the ```json block.' }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    try {
      data = JSON.parse(repairJson(raw))
    } catch (e) {
      return { patch: null, warnings: [], error: `The JSON in that reply is broken (${e instanceof Error ? e.message : 'parse error'}). Ask the AI to “resend the JSON only, valid JSON”.` }
    }
  }
  const warnings: string[] = []
  const patch = normalisePatch(data, warnings)
  if (!patch.story && !patch.characters.length && !patch.relationships.length && !patch.chapters.length)
    return { patch: null, warnings, error: 'The JSON didn’t contain any story, characters, relationships or chapters.' }
  return { patch, warnings }
}

/* ───────────────────────────── Normalisation ───────────────────────────── */

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

/** Case/format-insensitive key lookup: "must_include", "mustInclude", "Must include" all match. */
function pick(o: Obj, ...names: string[]): unknown {
  const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '')
  const wanted = names.map(norm)
  for (const [k, v] of Object.entries(o)) if (wanted.includes(norm(k))) return v
  return undefined
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map((x) => str(x) ?? '').filter(Boolean).join('\n')
  if (isObj(v))
    return Object.entries(v)
      .map(([k, x]) => `${k}: ${str(x) ?? ''}`)
      .join('\n')
  return undefined
}

function strList(v: unknown, splitCommas = true): string[] | undefined {
  if (v === undefined || v === null) return undefined
  if (Array.isArray(v)) return v.map((x) => (isObj(x) ? str(pick(x, 'name', 'line', 'text')) : str(x))).filter((x): x is string => !!x)
  if (typeof v === 'string') return v.split(splitCommas ? /\n|,(?![^(]*\))/ : /\n/).map((s) => s.trim()).filter(Boolean)
  return undefined
}

function num(v: unknown): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

/** Copy defined string fields from `src` into a new object. */
function strings<K extends string>(src: Obj, map: Record<K, string[]>): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {}
  for (const key of Object.keys(map) as K[]) {
    const v = str(pick(src, key, ...map[key]))
    if (v !== undefined) out[key] = v
  }
  return out
}

function traits(v: unknown): PatchTrait[] | undefined {
  if (v === undefined || v === null) return undefined
  // { "Hair": "red", "Build": "tall" }
  if (isObj(v)) return Object.entries(v).map(([label, value], i) => ({ label, value: str(value) ?? '', essential: i < 3 }))
  if (typeof v === 'string') return [{ label: 'Overall', value: v, essential: true }]
  if (Array.isArray(v))
    return v
      .map((t, i) => {
        if (typeof t === 'string') {
          const m = /^([^:]{1,30}):\s*(.+)$/.exec(t)
          return { label: m?.[1]?.trim() ?? '', value: (m?.[2] ?? t).trim(), essential: i < 3 }
        }
        if (isObj(t)) {
          const ess = pick(t, 'essential', 'starred', 'key', 'important')
          return {
            label: str(pick(t, 'label', 'name', 'trait', 'aspect')) ?? '',
            value: str(pick(t, 'value', 'description', 'detail', 'text')) ?? '',
            essential: typeof ess === 'boolean' ? ess : ess === undefined ? i < 3 : String(ess) === 'true',
          }
        }
        return null
      })
      .filter((t): t is PatchTrait => !!t && !!t.value)
  return undefined
}

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (isObj(v)) return [v]
  return []
}

export function normalisePatch(data: unknown, warnings: string[]): TrellisPatch {
  const root: Obj = isObj(data) ? (isObj(pick(data, 'patch', 'trellis', 'data')) ? (pick(data, 'patch', 'trellis', 'data') as Obj) : data) : {}

  const storySrc = pick(root, 'story')
  let story: PatchStory | undefined
  if (isObj(storySrc)) {
    const tense = str(pick(storySrc, 'tense'))?.toLowerCase()
    story = {
      ...strings(storySrc, {
        id: [],
        title: ['name'],
        logline: [],
        premise: ['synopsis', 'summary', 'overview'],
        genre: [],
        heat: ['heatLevel', 'spice', 'explicitness'],
        pov: ['pointOfView'],
        style: ['styleGuide', 'prose', 'voice'],
        contentRules: ['rules', 'content'],
        world: ['setting', 'settingAndWorld', 'worldbuilding'],
      }),
      ...(tense !== undefined ? { tense: tense.startsWith('pres') ? 'present' : tense.startsWith('past') ? 'past' : '' } : {}),
      ...(strList(pick(storySrc, 'tags')) ? { tags: strList(pick(storySrc, 'tags')) } : {}),
    }
  }

  const characters: PatchCharacter[] = []
  for (const c of asArray(pick(root, 'characters', 'cast'))) {
    if (!isObj(c)) continue
    const name = str(pick(c, 'name', 'fullName'))
    const id = str(pick(c, 'id'))
    if (!name && !id) {
      warnings.push('Skipped a character with no name.')
      continue
    }
    const appearance = traits(pick(c, 'appearance', 'physical', 'physicalDescription', 'looks', 'traits'))
    const sampleLines = strList(pick(c, 'sampleLines', 'sampleDialogue', 'dialogue', 'lines', 'quotes'), false)
    const tags = strList(pick(c, 'tags'))
    characters.push({
      name: name ?? '',
      ...strings(c, {
        id: [],
        aka: ['nickname', 'nicknames', 'alias'],
        pronouns: [],
        age: [],
        tagline: ['essence', 'oneLiner', 'summary', 'logline'],
        personality: [],
        voice: ['speech', 'speechPatterns', 'howTheyTalk'],
        motivations: ['wants', 'motivation', 'goals'],
        desires: ['kinks', 'preferences', 'desiresAndKinks', 'intimacy'],
        boundaries: ['limits', 'hardLimits'],
        backstory: ['history', 'background'],
        role: ['roleInStory', 'storyRole'],
        storyNotes: ['inThisStory', 'storySpecific'],
      }),
      ...(appearance ? { appearance } : {}),
      ...(sampleLines ? { sampleLines: sampleLines.map((l) => l.replace(/^["“]|["”]$/g, '')) } : {}),
      ...(tags ? { tags } : {}),
    })
  }

  const relationships: PatchRelationship[] = []
  for (const r of asArray(pick(root, 'relationships', 'dynamics'))) {
    if (!isObj(r)) continue
    let between = strList(pick(r, 'between', 'characters', 'pair', 'people'))
    if (!between || between.length < 2) {
      const a = str(pick(r, 'a', 'from', 'character1'))
      const b = str(pick(r, 'b', 'to', 'character2'))
      between = a && b ? [a, b] : between
    }
    if (!between || between.length < 2) {
      warnings.push('Skipped a relationship that didn’t name two characters.')
      continue
    }
    relationships.push({
      between: [between[0]!, between[1]!],
      ...strings(r, { label: ['summary', 'type', 'title'], dynamic: [], history: [], tension: ['currentTension', 'conflict'], consent: ['consentAndCheckIns', 'checkIns'] }),
    })
  }

  const chapters: PatchChapter[] = []
  for (const ch of asArray(pick(root, 'chapters', 'outline'))) {
    if (!isObj(ch)) continue
    const beats: PatchBeat[] = []
    for (const b of asArray(pick(ch, 'beats', 'scenes'))) {
      if (typeof b === 'string') {
        beats.push({ description: b })
        continue
      }
      if (!isObj(b)) continue
      const characters = strList(pick(b, 'characters', 'onThePage', 'cast'))
      const targetWords = num(pick(b, 'targetWords', 'words', 'length', 'wordCount'))
      beats.push({
        ...strings(b, {
          id: [],
          title: ['name'],
          description: ['whatHappens', 'summary', 'beat', 'action'],
          emotion: ['emotionalState', 'emotions', 'feelings'],
          tone: [],
          pacing: ['pace'],
          mustInclude: ['include'],
          mustAvoid: ['avoid', 'exclude'],
        }),
        ...(characters ? { characters } : {}),
        ...(targetWords !== undefined ? { targetWords } : {}),
      })
    }
    const mode = str(pick(ch, 'beatsMode', 'mode'))?.toLowerCase()
    const characters = strList(pick(ch, 'characters', 'cast'))
    chapters.push({
      ...strings(ch, { id: [], title: ['name'], purpose: ['goal', 'job'], summary: ['synopsis'], setting: ['location', 'place'], pov: ['povCharacter', 'pointOfView'] }),
      ...(characters ? { characters } : {}),
      ...(mode === 'replace' ? { beatsMode: 'replace' as const } : {}),
      ...(pick(ch, 'beats', 'scenes') !== undefined ? { beats } : {}),
    })
  }

  const notes = str(pick(root, 'notes', 'comments', 'explanation'))
  return { ...(story ? { story } : {}), characters, relationships, chapters, ...(notes ? { notes } : {}) }
}
