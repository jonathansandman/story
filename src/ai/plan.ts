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
  /** Selection key, so individual beats can be opted in/out. */
  key: string
  op: ChangeOp
  title: string
  fields: FieldChange[]
  row: Beat
  hasProse?: boolean
  /** Ticked by default? False for beats the AI marked optional. */
  defaultOn: boolean
  /** The AI's one-line reason. */
  why?: string
  /** Where a new beat lands, e.g. "After “The causeway”". */
  position?: string
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
  defaultOn: boolean
  why?: string
  position?: string
}

export interface Plan {
  targetStoryId: string | null
  storyIsNew: boolean
  changes: PlannedChange[]
  /** Final chapter order for the target story (ids), when chapters were added or moved. */
  chapterOrder?: string[]
  warnings: string[]
  notes?: string
}

export interface PlanOptions {
  /** The story the request was about, if any (refining a story/chapter/beat). */
  targetStoryId?: string | null
}

/** Everything ticked by default: all changes except ones the AI marked optional. */
export function defaultSelection(plan: Plan): Set<string> {
  const keys = new Set<string>()
  for (const c of plan.changes) {
    if (c.defaultOn || c.required) keys.add(c.key)
    for (const b of c.beats ?? []) if (b.defaultOn) keys.add(b.key)
  }
  return keys
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
    if (a !== b && (before || a)) out.push({ label, before: b, after: a })
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
  themes: 'Themes',
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
        defaultOn: true,
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
    changes.push({ key: `rel:${row.id}`, group: 'relationship', op: existing ? 'update' : 'create', title: `${names[0]} & ${names[1]}`, subtitle: row.label, fields: fieldChanges, row, defaultOn: true })
  }

  /* ── Chapters & beats ── */
  if (patch.chapters.length && !target) warnings.push('Chapters were included but there’s no story to put them in.')
  const storyChapters = target ? state.chapters.filter((c) => c.storyId === target!.id).sort((a, b) => a.order - b.order) : []
  let nextOrder = (storyChapters.at(-1)?.order ?? -1) + 1
  const usedChapters = new Set<string>()
  const referenced = new Set<string>()
  // Final chapter order: existing order, with new chapters inserted where the AI placed them.
  const chapterOrder: string[] = storyChapters.map((c) => c.id)
  const chapterTitles = new Map(storyChapters.map((c) => [c.id, c.title]))
  let lastNewChapter: string | null = null
  let chaptersMoved = false

  if (target)
    for (const pch of patch.chapters) {
      const existing =
        (pch.id && storyChapters.find((c) => c.id === pch.id && !usedChapters.has(c.id))) ||
        (pch.title && storyChapters.find((c) => !usedChapters.has(c.id) && norm(c.title) === norm(pch.title))) ||
        undefined
      if (existing) usedChapters.add(existing.id)
      const row = existing ? structuredClone(existing) : makeChapter(target.id, nextOrder++, {})
      const { id: _id, pov, characters, beats, beatsMode, after, optional, why, ...fields } = pch
      assignDefined(row, fields)
      chapterTitles.set(row.id, row.title)
      if (!existing) {
        chaptersMoved = true
        const anchor = after ? resolveChapterAnchor(after, storyChapters, chapterTitles) : lastNewChapter ? lastNewChapter : 'end'
        if (after && anchor === undefined) warnings.push(`Couldn’t find chapter “${after}” to place “${row.title || 'a new chapter'}” after; added it at the end.`)
        insertAfter(chapterOrder, row.id, anchor ?? 'end')
        lastNewChapter = row.id
      } else lastNewChapter = existing.id
      const label = pch.title || row.title || `Chapter ${row.order + 1}`
      if (pov !== undefined) row.povCharacterId = refChar(pov, label)
      const chars = refChars(characters, label)
      if (chars) row.characterIds = chars
      ;[row.povCharacterId, ...row.characterIds].forEach((id) => id && referenced.add(id))

      const fieldChanges = diff(existing ?? null, row, CHAPTER_LABELS)
      const povBefore = nameOf(state, existing?.povCharacterId ?? null, resolved)
      const povAfter = nameOf(state, row.povCharacterId, resolved)
      if (povBefore !== povAfter) fieldChanges.push({ label: 'POV', before: povBefore, after: povAfter })
      const charsBefore = (existing?.characterIds ?? []).map((id) => nameOf(state, id, resolved)).join(', ')
      const charsAfter = row.characterIds.map((id) => nameOf(state, id, resolved)).join(', ')
      if (charsBefore !== charsAfter) fieldChanges.push({ label: 'Characters', before: charsBefore, after: charsAfter })

      const { beatChanges, order } = planBeats(pch, beats, beatsMode, row, existing ? state.beats.filter((b) => b.chapterId === existing.id) : [], refChars, state, now, warnings)
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
          defaultOn: !optional,
          ...(why ? { why } : {}),
        })
    }

  // Number chapters by their final position and describe where new ones land.
  if (chaptersMoved) {
    for (const c of changes) {
      if (c.group !== 'chapter') continue
      const ch = c.row as Chapter
      const idx = chapterOrder.indexOf(ch.id)
      ch.order = idx
      c.title = `${idx + 1}. ${ch.title || 'Untitled chapter'}`
      if (c.op === 'create') c.position = idx === 0 ? 'At the start' : `After “${chapterTitles.get(chapterOrder[idx - 1]!) || `chapter ${idx}`}”`
    }
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
        defaultOn: true,
      })
    }
  }

  return {
    targetStoryId: target?.id ?? null,
    storyIsNew,
    changes,
    ...(chaptersMoved ? { chapterOrder } : {}),
    warnings: [...new Set(warnings)],
    ...(patch.notes ? { notes: patch.notes } : {}),
  }
}

function nameOf(state: DataState, id: string | null, resolved?: Map<string, Character>): string {
  if (!id) return ''
  return resolved?.get(id)?.name ?? state.characters.find((c) => c.id === id)?.name ?? '?'
}

/** Insert `id` into `list` after `anchor` ("start", "end", or an id in the list). */
function insertAfter(list: string[], id: string, anchor: string) {
  if (anchor === 'start') list.unshift(id)
  else if (anchor === 'end') list.push(id)
  else {
    const i = list.indexOf(anchor)
    if (i < 0) list.push(id)
    else list.splice(i + 1, 0, id)
  }
}

const isStart = (ref: string) => /^(start|beginning|first|top|0)$/i.test(ref.trim())

function resolveChapterAnchor(ref: string, chapters: Chapter[], titles: Map<string, string>): string | undefined {
  if (isStart(ref)) return 'start'
  const hit = chapters.find((c) => c.id === ref) ?? [...titles].find(([, t]) => norm(t) === norm(ref))
  if (hit) return Array.isArray(hit) ? hit[0] : hit.id
  const n = /(\d+)/.exec(ref)?.[1] // "chapter 3"
  return n ? chapters[Number(n) - 1]?.id : undefined
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
  warnings: string[],
): { beatChanges: BeatChange[]; order: string[] } {
  const existing = [...existingBeats].sort((a, b) => a.order - b.order)
  if (!patchBeats) return { beatChanges: [], order: existing.map((b) => b.id) }

  const used = new Set<string>()
  const changes: BeatChange[] = []
  const listed: { row: Beat; isNew: boolean; after?: string }[] = []
  const titles = new Map(existing.map((b) => [b.id, b.title || clip(b.description, 40)]))

  for (const pb of patchBeats) {
    const match =
      (pb.id && existing.find((b) => b.id === pb.id && !used.has(b.id))) ||
      (pb.title && existing.find((b) => !used.has(b.id) && norm(b.title) === norm(pb.title))) ||
      undefined
    if (match) used.add(match.id)
    const row = match ? structuredClone(match) : makeBeat(chapter.storyId, chapter.id, 0, {})
    const { id: _id, characters, after, optional, why, ...fields } = pb
    assignDefined(row, fields)
    const chars = refChars(characters, `Beat “${pb.title || row.title || 'untitled'}” (${pch.title || chapter.title || 'chapter'})`)
    if (chars) row.characterIds = chars
    if (!match) row.status = row.description ? 'planned' : 'idea'
    titles.set(row.id, row.title || clip(row.description, 40))
    const fields2 = diff(match ?? null, row, BEAT_LABELS)
    const cb = (match?.characterIds ?? []).map((id) => nameOf(state, id)).join(', ')
    const ca = row.characterIds.map((id) => nameOf(state, id)).join(', ')
    if (chars && cb !== ca) fields2.push({ label: 'On the page', before: cb, after: ca || '(chapter’s characters)' })
    if (match) row.updatedAt = now
    listed.push({ row, isNew: !match, after })
    if (!match || fields2.length)
      changes.push({
        key: `beat:${row.id}`,
        op: match ? 'update' : 'create',
        title: row.title || clip(row.description, 60) || 'Untitled beat',
        fields: fields2,
        row,
        defaultOn: !optional,
        ...(why ? { why } : {}),
      })
  }

  const unlisted = existing.filter((b) => !used.has(b.id))
  let order: string[]
  if (mode === 'replace') {
    order = listed.map((l) => l.row.id)
    for (const b of unlisted)
      changes.push({
        key: `beat:${b.id}`,
        op: 'delete',
        title: b.title || clip(b.description, 60) || 'Untitled beat',
        fields: [],
        row: b,
        hasProse: state.beatsWithProse?.has(b.id),
        defaultOn: true,
      })
  } else if (unlisted.length === 0 && listed.every((l) => !l.after)) {
    order = listed.map((l) => l.row.id) // the model listed everything: adopt its order
  } else {
    // Keep existing order; place each new beat after its "after" anchor, or
    // after whatever the model listed just before it, or at the end.
    order = existing.map((b) => b.id)
    const lastAfter = new Map<string, string>() // anchor → last beat inserted there (keeps list order)
    let prev: string | null = null
    for (const l of listed) {
      if (!l.isNew) {
        prev = l.row.id
        continue
      }
      let anchor: string
      if (l.after) {
        if (isStart(l.after)) anchor = 'start'
        else {
          const hit =
            existing.find((b) => b.id === l.after) ??
            listed.find((x) => x.row.id === l.after) ??
            [...titles].map(([id, t]) => ({ id, t })).find((x) => norm(x.t) === norm(l.after!))
          const id = hit ? ('row' in hit ? hit.row.id : hit.id) : undefined
          if (!id) warnings.push(`Couldn’t find beat “${l.after}” to place “${l.row.title || 'a new beat'}” after; added it ${prev ? 'after the previous one' : 'at the end'}.`)
          anchor = id ?? prev ?? 'end'
        }
      } else anchor = prev ?? 'end'
      const effective = lastAfter.get(anchor) ?? anchor
      if (effective === 'start') order.unshift(l.row.id)
      else insertAfter(order, l.row.id, effective)
      lastAfter.set(anchor, l.row.id)
      prev = l.row.id
    }
  }

  // Final positions and human-readable placement for new beats.
  const rows = new Map(listed.map((l) => [l.row.id, l.row]))
  order.forEach((id, i) => {
    const r = rows.get(id)
    if (r) r.order = i
  })
  for (const c of changes)
    if (c.op === 'create') {
      const i = order.indexOf(c.row.id)
      c.position = i === 0 ? 'At the start' : `After “${titles.get(order[i - 1]!) ?? 'previous beat'}”`
    }
  return { beatChanges: changes, order }
}
