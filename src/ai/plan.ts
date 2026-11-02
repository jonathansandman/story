import { makeBeat, makeChapter, makeCharacter, makeRelationship, makeStory, makeTrait, sortPair } from '@/db/factories'
import type { Beat, Chapter, Character, Relationship, Story } from '@/db/types'
import type { PatchBeat, PatchChapter, PatchCharacter, TrellisPatch } from './patch'

/**
 * Turn a parsed patch into a concrete, reviewable plan against current data.
 *
 * The plan holds the exact rows that would be written, so the preview the
 * user sees *is* the change — applying is mechanical (see apply.ts). This is
 * a pure function of (patch, state, options): easy to test, no surprises.
 */

export interface DataState {
  stories: Story[]
  characters: Character[]
  relationships: Relationship[]
  chapters: Chapter[]
  beats: Beat[]
  /** beatId → has prose, used to warn before deleting written beats. */
  beatsWithProse?: Set<string>
}

export interface FieldChange {
  label: string
  before: string
  after: string
}

export type ChangeOp = 'create' | 'update' | 'delete'

export interface BeatChange {
  op: ChangeOp
  title: string
  fields: FieldChange[]
  row: Beat
  hasProse?: boolean
}

export interface PlannedChange {
  /** Stable selection key. */
  key: string
  group: 'story' | 'character' | 'relationship' | 'chapter'
  op: 'create' | 'update'
  title: string
  subtitle?: string
  fields: FieldChange[]
  /** Can't be unticked (e.g. a new story other changes depend on). */
  required?: boolean
  row: Story | Character | Relationship | Chapter
  beats?: BeatChange[]
  /** For chapters: the full final beat order (ids), written on apply. */
  beatOrder?: string[]
}

export interface Plan {
  targetStoryId: string | null
  storyIsNew: boolean
  changes: PlannedChange[]
  warnings: string[]
  notes?: string
}

export interface PlanOptions {
  /** The story the request was about, if any (refining a story/chapter/beat). */
  targetStoryId?: string | null
}

/* ───────────────────────────── helpers ───────────────────────────── */

const norm = (s: string | undefined | null) =>
  (s ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const clip = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function diff<T extends object>(before: T | null, after: T, labels: Partial<Record<keyof T, string>>, show: (v: unknown) => string = defaultShow): FieldChange[] {
  const out: FieldChange[] = []
  for (const [key, label] of Object.entries(labels) as [keyof T, string][]) {
    const a = show(after[key])
    const b = before ? show(before[key]) : ''
    if (a !== b && (before || a)) out.push({ label, before: clip(b), after: clip(a) })
  }
  return out
}

function defaultShow(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x && 'value' in x ? `${(x as { label: string }).label}: ${(x as { value: string }).value}` : String(x))).join(' · ')
  return String(v)
}

/** Assign only the keys that are defined in `src`. */
function assignDefined<T extends object>(target: T, src: Partial<T>): T {
  for (const [k, v] of Object.entries(src)) if (v !== undefined) (target as Record<string, unknown>)[k] = v
  return target
}

const STORY_LABELS: Partial<Record<keyof Story, string>> = {
  title: 'Title',
  logline: 'Logline',
  premise: 'Premise',
  genre: 'Genre',
  heat: 'Heat',
  pov: 'POV',
  tense: 'Tense',
  style: 'Style guide',
  contentRules: 'Content rules',
  world: 'World',
  tags: 'Tags',
}
const CHARACTER_LABELS: Partial<Record<keyof Character, string>> = {
  name: 'Name',
  aka: 'Also called',
  pronouns: 'Pronouns',
  age: 'Age',
  tagline: 'Essence',
  appearance: 'Appearance',
  personality: 'Personality',
  voice: 'Voice',
  sampleLines: 'Sample lines',
  motivations: 'Wants',
  desires: 'Desires',
  boundaries: 'Boundaries',
  backstory: 'Backstory',
  tags: 'Tags',
}
const REL_LABELS: Partial<Record<keyof Relationship, string>> = { label: 'Label', dynamic: 'Dynamic', history: 'History', tension: 'Tension', consent: 'Consent' }
const CHAPTER_LABELS: Partial<Record<keyof Chapter, string>> = { title: 'Title', purpose: 'Purpose', summary: 'Summary', setting: 'Setting' }
const BEAT_LABELS: Partial<Record<keyof Beat, string>> = {
  title: 'Title',
  description: 'What happens',
  emotion: 'Emotion',
  tone: 'Tone',
  pacing: 'Pacing',
  mustInclude: 'Must include',
  mustAvoid: 'Must avoid',
  targetWords: 'Length',
}

/* ───────────────────────────── main ───────────────────────────── */

export function planPatch(patch: TrellisPatch, state: DataState, options: PlanOptions = {}): Plan {
  const warnings: string[] = []
  const changes: PlannedChange[] = []
  const now = Date.now()

  /* ── Target story ── */
  const byStoryId = new Map(state.stories.map((s) => [s.id, s]))
  const explicit = patch.story?.id ? byStoryId.get(patch.story.id) : undefined
  if (patch.story?.id && !explicit && options.targetStoryId) warnings.push('The reply referred to a story id that doesn’t exist; applying to the current story instead.')
  let target: Story | undefined = explicit ?? (options.targetStoryId ? byStoryId.get(options.targetStoryId) : undefined)
  const needsStory = !!patch.story || patch.chapters.length > 0
  const storyIsNew = !target && needsStory
  const storyBefore = target ? structuredClone(target) : null
  let storyRow: Story | null = null
  if (target) storyRow = structuredClone(target)
  else if (storyIsNew) storyRow = makeStory({ title: 'Untitled story', status: 'outlining' })
  if (storyRow && patch.story) {
    const { id: _ignore, ...fields } = patch.story
    assignDefined(storyRow, fields)
  }
  target = storyRow ?? undefined

  /* ── Characters ── */
  const libByName = new Map<string, Character>()
  const firstNames = new Map<string, Character[]>()
  for (const c of state.characters) {
    libByName.set(norm(c.name), c)
    for (const alias of c.aka.split(/[,(]/)) if (norm(alias)) libByName.set(norm(alias), libByName.get(norm(alias)) ?? c)
    const first = norm(c.name).split(' ')[0]
    if (first) firstNames.set(first, [...(firstNames.get(first) ?? []), c])
  }
  const findExisting = (pc: Pick<PatchCharacter, 'id' | 'name'>): Character | undefined => {
    if (pc.id) {
      const hit = state.characters.find((c) => c.id === pc.id)
      if (hit) return hit
    }
    const n = norm(pc.name)
    if (!n) return undefined
    return libByName.get(n) ?? (firstNames.get(n)?.length === 1 ? firstNames.get(n)![0] : undefined)
  }

  /** name → resolved character row (patched or existing), used for all name references. */
  const resolved = new Map<string, Character>()
  const characterRows = new Map<string, Character>()
  const castAdds: { characterId: string; role?: string; storyNotes?: string }[] = []

  for (const pc of patch.characters) {
    const existing = findExisting(pc)
    const row = existing ? structuredClone(existing) : makeCharacter({ name: pc.name, appearance: [] })
    const { id: _id, role, storyNotes, appearance, ...fields } = pc
    // Only rename when the reply explicitly targeted this character by id —
    // "June" matching Juniper Hale by nickname must not rename her.
    const rename = !existing || (pc.id === existing.id && !!pc.name)
    assignDefined(row, { ...fields, name: rename ? pc.name || row.name : row.name })
    if (appearance) {
      // Keep trait ids where labels match so existing stars/edits feel stable.
      const old = new Map(row.appearance.map((t) => [norm(t.label), t]))
      row.appearance = appearance.map((t) => ({ ...(old.get(norm(t.label)) ?? makeTrait()), label: t.label, value: t.value, essential: t.essential }))
    }
    if (existing) row.updatedAt = now
    const fieldChanges = diff(existing ?? null, row, CHARACTER_LABELS)
    characterRows.set(row.id, row)
    for (const key of [norm(row.name), norm(pc.name), ...(norm(row.name).split(' ')[0] ? [norm(row.name).split(' ')[0]!] : [])]) if (key) resolved.set(key, row)
    resolved.set(row.id, row)
    if (target && (role !== undefined || storyNotes !== undefined || storyIsNew)) castAdds.push({ characterId: row.id, role, storyNotes })
    if (!existing || fieldChanges.length)
      changes.push({
        key: `char:${row.id}`,
        group: 'character',
        op: existing ? 'update' : 'create',
        title: row.name || 'Unnamed character',
        subtitle: existing ? undefined : row.tagline,
        fields: fieldChanges,
        row,
      })
  }

  const refChar = (ref: string | undefined, context: string): string | null => {
    if (!ref) return null
    const n = norm(ref)
    const hit = resolved.get(ref) ?? resolved.get(n) ?? findExisting({ id: ref, name: ref })
    if (!hit) {
      warnings.push(`${context}: couldn’t find a character called “${ref}”.`)
      return null
    }
    if (!resolved.has(hit.id)) resolved.set(hit.id, hit)
    return hit.id
  }
  const refChars = (refs: string[] | undefined, context: string): string[] | undefined =>
    refs ? [...new Set(refs.map((r) => refChar(r, context)).filter((x): x is string => !!x))] : undefined

  /* ── Relationships ── */
  for (const pr of patch.relationships) {
    const a = refChar(pr.between[0], 'Relationship')
    const b = refChar(pr.between[1], 'Relationship')
    if (!a || !b || a === b) continue
    const [x, y] = sortPair(a, b)
    const existing = state.relationships.find((r) => r.characterIds[0] === x && r.characterIds[1] === y)
    const row = existing ? structuredClone(existing) : makeRelationship(x, y)
    const { between: _between, ...fields } = pr
    assignDefined(row, fields)
    const fieldChanges = diff(existing ?? null, row, REL_LABELS)
    if (existing && !fieldChanges.length) continue
    const names = [a, b].map((id) => resolved.get(id)?.name ?? '?')
    changes.push({ key: `rel:${row.id}`, group: 'relationship', op: existing ? 'update' : 'create', title: `${names[0]} & ${names[1]}`, subtitle: row.label, fields: fieldChanges, row })
  }

  /* ── Chapters & beats ── */
  if (patch.chapters.length && !target) warnings.push('Chapters were included but there’s no story to put them in.')
  const storyChapters = target ? state.chapters.filter((c) => c.storyId === target!.id).sort((a, b) => a.order - b.order) : []
  let nextOrder = (storyChapters.at(-1)?.order ?? -1) + 1
  const usedChapters = new Set<string>()
  const referenced = new Set<string>()

  if (target)
    for (const pch of patch.chapters) {
      const existing =
        (pch.id && storyChapters.find((c) => c.id === pch.id && !usedChapters.has(c.id))) ||
        (pch.title && storyChapters.find((c) => !usedChapters.has(c.id) && norm(c.title) === norm(pch.title))) ||
        undefined
      if (existing) usedChapters.add(existing.id)
      const row = existing ? structuredClone(existing) : makeChapter(target.id, nextOrder++, {})
      const { id: _id, pov, characters, beats, beatsMode, ...fields } = pch
      assignDefined(row, fields)
      const label = pch.title || row.title || `Chapter ${row.order + 1}`
      if (pov !== undefined) row.povCharacterId = refChar(pov, label)
      const chars = refChars(characters, label)
      if (chars) row.characterIds = chars
      ;[row.povCharacterId, ...row.characterIds].forEach((id) => id && referenced.add(id))

      const fieldChanges = diff(existing ?? null, row, CHAPTER_LABELS)
      const povBefore = existing?.povCharacterId ? (resolved.get(existing.povCharacterId)?.name ?? nameOf(state, existing.povCharacterId)) : ''
      const povAfter = row.povCharacterId ? (resolved.get(row.povCharacterId)?.name ?? '') : ''
      if (povBefore !== povAfter) fieldChanges.push({ label: 'POV', before: povBefore, after: povAfter })
      const charsBefore = (existing?.characterIds ?? []).map((id) => nameOf(state, id, resolved)).join(', ')
      const charsAfter = row.characterIds.map((id) => nameOf(state, id, resolved)).join(', ')
      if (charsBefore !== charsAfter) fieldChanges.push({ label: 'Characters', before: charsBefore, after: charsAfter })

      const { beatChanges, order } = planBeats(pch, beats, beatsMode, row, existing ? state.beats.filter((b) => b.chapterId === existing.id) : [], refChars, state, now)
      for (const bc of beatChanges) bc.row.characterIds.forEach((id) => referenced.add(id))
      if (existing) row.updatedAt = now

      if (!existing || fieldChanges.length || beatChanges.length)
        changes.push({
          key: `ch:${row.id}`,
          group: 'chapter',
          op: existing ? 'update' : 'create',
          title: `${row.order + 1}. ${row.title || 'Untitled chapter'}`,
          subtitle: existing ? undefined : row.purpose,
          fields: fieldChanges,
          row,
          beats: beatChanges,
          beatOrder: order,
        })
    }

  /* ── Cast: characters given a role, plus anyone referenced by chapters/beats ── */
  if (target && storyRow) {
    for (const id of referenced) if (!castAdds.some((c) => c.characterId === id)) castAdds.push({ characterId: id })
    const castBefore = storyRow.cast.map((m) => `${nameOf(state, m.characterId, resolved)}${m.role ? ` (${m.role})` : ''}`).join(', ')
    for (const add of castAdds) {
      const m = storyRow.cast.find((x) => x.characterId === add.characterId)
      if (m) {
        if (add.role !== undefined) m.role = add.role
        if (add.storyNotes !== undefined) m.storyNotes = add.storyNotes
      } else storyRow.cast.push({ characterId: add.characterId, role: add.role ?? '', storyNotes: add.storyNotes ?? '' })
    }
    const castAfter = storyRow.cast.map((m) => `${nameOf(state, m.characterId, resolved)}${m.role ? ` (${m.role})` : ''}`).join(', ')
    const fields = diff(storyBefore, storyRow, STORY_LABELS)
    if (castBefore !== castAfter) fields.push({ label: 'Cast', before: clip(castBefore), after: clip(castAfter) })
    const notesChanged = storyBefore && storyRow.cast.some((m) => {
      const b = storyBefore.cast.find((x) => x.characterId === m.characterId)
      return b && b.storyNotes !== m.storyNotes
    })
    if (notesChanged) fields.push({ label: 'Cast notes', before: '', after: 'Updated story-specific notes' })
    if (storyIsNew || fields.length) {
      if (!storyIsNew) storyRow.updatedAt = now
      changes.unshift({
        key: 'story',
        group: 'story',
        op: storyIsNew ? 'create' : 'update',
        title: storyRow.title || 'Untitled story',
        subtitle: storyIsNew ? storyRow.logline : undefined,
        fields,
        row: storyRow,
        required: storyIsNew,
      })
    }
  }

  return { targetStoryId: target?.id ?? null, storyIsNew, changes, warnings: [...new Set(warnings)], ...(patch.notes ? { notes: patch.notes } : {}) }
}

function nameOf(state: DataState, id: string | null, resolved?: Map<string, Character>): string {
  if (!id) return ''
  return resolved?.get(id)?.name ?? state.characters.find((c) => c.id === id)?.name ?? '?'
}

function planBeats(
  pch: PatchChapter,
  patchBeats: PatchBeat[] | undefined,
  mode: 'merge' | 'replace' | undefined,
  chapter: Chapter,
  existingBeats: Beat[],
  refChars: (refs: string[] | undefined, context: string) => string[] | undefined,
  state: DataState,
  now: number,
): { beatChanges: BeatChange[]; order: string[] } {
  const existing = [...existingBeats].sort((a, b) => a.order - b.order)
  if (!patchBeats) return { beatChanges: [], order: existing.map((b) => b.id) }

  const used = new Set<string>()
  const changes: BeatChange[] = []
  const listed: Beat[] = []

  for (const pb of patchBeats) {
    const match =
      (pb.id && existing.find((b) => b.id === pb.id && !used.has(b.id))) ||
      (pb.title && existing.find((b) => !used.has(b.id) && norm(b.title) === norm(pb.title))) ||
      undefined
    if (match) used.add(match.id)
    const row = match ? structuredClone(match) : makeBeat(chapter.storyId, chapter.id, 0, {})
    const { id: _id, characters, ...fields } = pb
    assignDefined(row, fields)
    const chars = refChars(characters, `Beat “${pb.title || row.title || 'untitled'}” (${pch.title || chapter.title || 'chapter'})`)
    if (chars) row.characterIds = chars
    if (!match) row.status = row.description ? 'planned' : 'idea'
    const fields2 = diff(match ?? null, row, BEAT_LABELS)
    const cb = (match?.characterIds ?? []).map((id) => nameOf(state, id)).join(', ')
    const ca = row.characterIds.map((id) => nameOf(state, id)).join(', ')
    if (chars && cb !== ca) fields2.push({ label: 'On the page', before: cb, after: ca || '(chapter’s characters)' })
    if (match) row.updatedAt = now
    listed.push(row)
    if (!match || fields2.length) changes.push({ op: match ? 'update' : 'create', title: row.title || clip(row.description, 60) || 'Untitled beat', fields: fields2, row })
  }

  const unlisted = existing.filter((b) => !used.has(b.id))
  let final: Beat[]
  if (mode === 'replace') {
    final = listed
    for (const b of unlisted)
      changes.push({ op: 'delete', title: b.title || clip(b.description, 60) || 'Untitled beat', fields: [], row: b, hasProse: state.beatsWithProse?.has(b.id) })
  } else if (unlisted.length === 0) {
    final = listed // every existing beat was mentioned: adopt the model's order
  } else {
    final = [...existing.map((b) => listed.find((l) => l.id === b.id) ?? b), ...listed.filter((l) => !existing.some((b) => b.id === l.id))]
  }
  final.forEach((b, i) => (b.order = i))
  return { beatChanges: changes, order: final.map((b) => b.id) }
}
