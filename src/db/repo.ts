import { db, SCHEMA_VERSION, type TrellisDB } from './db'
import { makeBeat, makeChapter, makeCharacter, makeDraft, makeRelationship, makeStory, sortPair } from './factories'
import type { Beat, Chapter, Character, Draft, DraftSource, Idea, Relationship, Story, TrellisBackup } from './types'
import { newId } from '@/lib/id'
import { stripMarkers } from '@/export/split'

/**
 * All writes go through this module. Components never call `db.table.put`
 * directly — that keeps invariants (timestamps, ordering, cascading deletes)
 * in one place and gives a future sync layer a single seam to hook into.
 */

type Patch<T> = Partial<Omit<T, 'id' | 'createdAt'>>

const touch = <T extends object>(patch: T) => ({ ...patch, updatedAt: Date.now() })

/* ───────────── Characters ───────────── */

export async function createCharacter(partial: Partial<Character> = {}): Promise<Character> {
  const c = makeCharacter(partial)
  await db.characters.add(c)
  return c
}

export function updateCharacter(id: string, patch: Patch<Character>) {
  return db.characters.update(id, touch(patch))
}

/**
 * Read-modify-write inside a single IndexedDB operation. Use for edits to
 * nested arrays (traits, sample lines) so two quick debounced commits can't
 * overwrite each other with a stale copy.
 */
export function mutateCharacter(id: string, fn: (c: Character) => void) {
  return db.characters
    .where('id')
    .equals(id)
    .modify((c) => {
      fn(c)
      c.updatedAt = Date.now()
    })
}

export async function duplicateCharacter(id: string): Promise<Character | undefined> {
  const src = await db.characters.get(id)
  if (!src) return
  const now = Date.now()
  const copy: Character = {
    ...structuredClone(src),
    id: newId('c_'),
    name: `${src.name} (copy)`,
    appearance: src.appearance.map((t) => ({ ...t, id: newId('t_') })),
    createdAt: now,
    updatedAt: now,
  }
  await db.characters.add(copy)
  return copy
}

/** Deletes a character and unlinks it everywhere it was referenced. */
export async function deleteCharacter(id: string) {
  await db.transaction('rw', [db.characters, db.relationships, db.stories, db.chapters, db.beats], async () => {
    await db.characters.delete(id)
    await db.relationships.where('characterIds').equals(id).delete()
    await db.stories.toCollection().modify((s) => {
      s.cast = s.cast.filter((m) => m.characterId !== id)
    })
    await db.chapters.toCollection().modify((ch) => {
      ch.characterIds = ch.characterIds.filter((c) => c !== id)
      if (ch.povCharacterId === id) ch.povCharacterId = null
    })
    await db.beats.toCollection().modify((b) => {
      b.characterIds = b.characterIds.filter((c) => c !== id)
    })
  })
}

/* ───────────── Relationships ───────────── */

export async function getOrCreateRelationship(a: string, b: string): Promise<Relationship> {
  const [x, y] = sortPair(a, b)
  const existing = (await db.relationships.where('characterIds').equals(x).toArray()).find(
    (r) => r.characterIds[1] === y,
  )
  if (existing) return existing
  const r = makeRelationship(x, y)
  await db.relationships.add(r)
  return r
}

export function updateRelationship(id: string, patch: Patch<Relationship>) {
  return db.relationships.update(id, touch(patch))
}

export function deleteRelationship(id: string) {
  return db.relationships.delete(id)
}

/* ───────────── Stories ───────────── */

export async function createStory(partial: Partial<Story> = {}): Promise<Story> {
  const s = makeStory(partial)
  await db.transaction('rw', db.stories, db.chapters, async () => {
    await db.stories.add(s)
    await db.chapters.add(makeChapter(s.id, 0, { title: 'Chapter one' }))
  })
  return s
}

export function updateStory(id: string, patch: Patch<Story>) {
  return db.stories.update(id, touch(patch))
}

/** Read-modify-write for nested story fields (cast). See `mutateCharacter`. */
export function mutateStory(id: string, fn: (s: Story) => void) {
  return db.stories
    .where('id')
    .equals(id)
    .modify((s) => {
      fn(s)
      s.updatedAt = Date.now()
    })
}

export async function deleteStory(id: string) {
  await db.transaction('rw', [db.stories, db.chapters, db.beats, db.drafts], async () => {
    await db.drafts.where('storyId').equals(id).delete()
    await db.beats.where('storyId').equals(id).delete()
    await db.chapters.where('storyId').equals(id).delete()
    await db.stories.delete(id)
  })
}

export async function addToCast(storyId: string, characterId: string, role = '') {
  await db.stories
    .where('id')
    .equals(storyId)
    .modify((s) => {
      if (!s.cast.some((m) => m.characterId === characterId)) {
        s.cast.push({ characterId, role, storyNotes: '' })
        s.updatedAt = Date.now()
      }
    })
}

/* ───────────── Chapters ───────────── */

export async function createChapter(storyId: string, partial: Partial<Chapter> = {}): Promise<Chapter> {
  const last = await db.chapters.where('[storyId+order]').between([storyId, -Infinity], [storyId, Infinity]).last()
  const ch = makeChapter(storyId, (last?.order ?? -1) + 1, partial)
  await db.chapters.add(ch)
  await touchStory(storyId)
  return ch
}

export async function updateChapter(id: string, patch: Patch<Chapter>) {
  await db.chapters.update(id, touch(patch))
  const ch = await db.chapters.get(id)
  if (ch) await touchStory(ch.storyId)
}

export async function deleteChapter(id: string) {
  await db.transaction('rw', db.chapters, db.beats, db.drafts, async () => {
    const beatIds = await db.beats.where('chapterId').equals(id).primaryKeys()
    await db.drafts.where('beatId').anyOf(beatIds).delete()
    await db.beats.where('chapterId').equals(id).delete()
    await db.chapters.delete(id)
  })
}

/* ───────────── Beats ───────────── */

export async function createBeat(chapterId: string, partial: Partial<Beat> = {}, afterOrder?: number): Promise<Beat> {
  const chapter = await db.chapters.get(chapterId)
  if (!chapter) throw new Error(`Chapter ${chapterId} not found`)
  return db.transaction('rw', db.beats, async () => {
    const siblings = await beatsOf(chapterId)
    let order = (siblings.at(-1)?.order ?? -1) + 1
    if (afterOrder !== undefined) {
      // Insert after a given beat: shift everything below it down by one.
      order = afterOrder + 1
      await Promise.all(
        siblings.filter((b) => b.order >= order).map((b) => db.beats.update(b.id, { order: b.order + 1 })),
      )
    }
    const beat = makeBeat(chapter.storyId, chapterId, order, partial)
    await db.beats.add(beat)
    return beat
  })
}

export async function updateBeat(id: string, patch: Patch<Beat>) {
  await db.beats.update(id, touch(patch))
}

export async function deleteBeat(id: string) {
  await db.transaction('rw', db.beats, db.drafts, async () => {
    await db.drafts.where('beatId').equals(id).delete()
    await db.beats.delete(id)
  })
}

export async function duplicateBeat(id: string): Promise<Beat | undefined> {
  const src = await db.beats.get(id)
  if (!src) return
  const { id: _id, createdAt: _c, updatedAt: _u, order: _o, ...rest } = src
  return createBeat(
    src.chapterId,
    { ...rest, title: src.title ? `${src.title} (copy)` : '', status: 'idea', recap: '', activeDraftId: null },
    src.order,
  )
}

/** Move a beat to the end of another chapter. */
export async function moveBeatToChapter(beatId: string, chapterId: string) {
  await db.transaction('rw', db.beats, async () => {
    const siblings = await beatsOf(chapterId)
    await db.beats.update(beatId, touch({ chapterId, order: (siblings.at(-1)?.order ?? -1) + 1 }))
  })
}

/**
 * Persist a new ordering for a list of rows (chapters within a story, or
 * beats within a chapter). Only rows whose order actually changed are written.
 */
export async function reorder(table: 'chapters' | 'beats', orderedIds: string[]) {
  const t = db.table<Chapter | Beat, string>(table)
  await db.transaction('rw', t, async () => {
    const rows = await t.bulkGet(orderedIds)
    await Promise.all(
      rows.map((row, i) => (row && row.order !== i ? t.update(row.id, { order: i }) : undefined)),
    )
  })
}

/* ───────────── Drafts (prose) ───────────── */

/**
 * Save prose for a beat as a new version and make it active. If the beat was
 * still being planned, it moves to "written" — the writer just told us so.
 */
export async function addDraft(beatId: string, text: string, source: DraftSource = 'pasted', note = ''): Promise<Draft | undefined> {
  const beat = await db.beats.get(beatId)
  // Some models add [[Beat N]] markers even to single-beat replies; never store them.
  const clean = stripMarkers(text)
  if (!beat || !clean) return
  const draft = makeDraft(beat, clean, source, note)
  await db.transaction('rw', db.beats, db.drafts, async () => {
    await db.drafts.add(draft)
    await db.beats.update(beatId, touch({ activeDraftId: draft.id, status: 'written' as const }))
  })
  return draft
}

export function updateDraft(id: string, patch: Partial<Pick<Draft, 'text' | 'note'>>) {
  return db.drafts.update(id, touch(patch))
}

export function setActiveDraft(beatId: string, draftId: string | null) {
  return db.beats.update(beatId, touch({ activeDraftId: draftId }))
}

/** Delete a version; if it was active, fall back to the newest remaining one. */
export async function deleteDraft(id: string) {
  await db.transaction('rw', db.beats, db.drafts, async () => {
    const d = await db.drafts.get(id)
    if (!d) return
    await db.drafts.delete(id)
    const beat = await db.beats.get(d.beatId)
    if (beat?.activeDraftId === id) {
      const rest = await db.drafts.where('beatId').equals(d.beatId).sortBy('createdAt')
      await db.beats.update(d.beatId, { activeDraftId: rest.at(-1)?.id ?? null, ...(rest.length ? {} : { status: 'ready' as const }) })
    }
  })
}

/* ───────────── Helpers ───────────── */

export function beatsOf(chapterId: string, database: TrellisDB = db) {
  return database.beats.where('[chapterId+order]').between([chapterId, -Infinity], [chapterId, Infinity]).toArray()
}

export function chaptersOf(storyId: string, database: TrellisDB = db) {
  return database.chapters.where('[storyId+order]').between([storyId, -Infinity], [storyId, Infinity]).toArray()
}

async function touchStory(storyId: string) {
  await db.stories.update(storyId, { updatedAt: Date.now() })
}

/* ───────────── Backup / restore / snapshots ───────────── */

export async function exportBackup(database: TrellisDB = db): Promise<TrellisBackup> {
  const [characters, relationships, stories, chapters, beats, drafts] = await Promise.all([
    database.characters.toArray(),
    database.relationships.toArray(),
    database.stories.toArray(),
    database.chapters.toArray(),
    database.beats.toArray(),
    database.drafts.toArray(),
  ])
  return { app: 'trellis', schemaVersion: SCHEMA_VERSION, exportedAt: Date.now(), characters, relationships, stories, chapters, beats, drafts }
}

export function isBackup(value: unknown): value is TrellisBackup {
  const v = value as Partial<TrellisBackup> | null
  return !!v && v.app === 'trellis' && Array.isArray(v.characters) && Array.isArray(v.stories) && Array.isArray(v.beats)
}

/** Replace everything with the backup's contents. */
export async function importBackup(backup: TrellisBackup, database: TrellisDB = db) {
  if (!isBackup(backup)) throw new Error('This file is not a Trellis backup.')
  await database.transaction(
    'rw',
    [database.characters, database.relationships, database.stories, database.chapters, database.beats, database.drafts],
    async () => {
      await Promise.all([
        database.characters.clear(),
        database.relationships.clear(),
        database.stories.clear(),
        database.chapters.clear(),
        database.beats.clear(),
        database.drafts.clear(),
      ])
      await database.characters.bulkAdd(backup.characters)
      await database.relationships.bulkAdd(backup.relationships ?? [])
      // Older backups predate themes and the ideas inbox.
      await database.stories.bulkAdd(backup.stories.map((s) => ({ ...s, themes: s.themes ?? [], ideas: s.ideas ?? [] })))
      await database.chapters.bulkAdd(backup.chapters ?? [])
      // v1 backups predate drafts: default the new field.
      await database.beats.bulkAdd(backup.beats.map((b) => ({ ...b, activeDraftId: b.activeDraftId ?? null })))
      await database.drafts.bulkAdd(backup.drafts ?? [])
    },
  )
}

export const MAX_SNAPSHOTS = 20

export async function takeSnapshot(label: string) {
  const data = JSON.stringify(await exportBackup())
  await db.snapshots.add({ id: newId('snap_'), createdAt: Date.now(), label, data })
  const all = await db.snapshots.orderBy('createdAt').toArray()
  const excess = all.length - MAX_SNAPSHOTS
  if (excess > 0) await db.snapshots.bulkDelete(all.slice(0, excess).map((s) => s.id))
}

export async function restoreSnapshot(id: string) {
  const snap = await db.snapshots.get(id)
  if (!snap) return
  await takeSnapshot('Before restoring a snapshot')
  await importBackup(JSON.parse(snap.data) as TrellisBackup)
}

/** Take an automatic snapshot at most once per `intervalMs` (called on app start). */
export async function autoSnapshot(intervalMs = 1000 * 60 * 60 * 6) {
  const last = await db.snapshots.orderBy('createdAt').last()
  if (!last || Date.now() - last.createdAt > intervalMs) {
    const count = await db.characters.count()
    if (count > 0) await takeSnapshot('Automatic')
  }
}

/* ───────────── Ideas inbox ───────────── */

export async function addIdea(storyId: string, text: string, kind: Idea['kind'] = 'idea') {
  const t = text.trim()
  if (!t) return
  await mutateStory(storyId, (s) => {
    s.ideas = [...(s.ideas ?? []), { id: newId('i_'), text: t, kind, createdAt: Date.now() }]
  })
}

export function updateIdea(storyId: string, ideaId: string, text: string) {
  return mutateStory(storyId, (s) => {
    const i = s.ideas?.find((x) => x.id === ideaId)
    if (i) i.text = text
  })
}

export function removeIdeas(storyId: string, ideaIds: string[]) {
  return mutateStory(storyId, (s) => {
    s.ideas = (s.ideas ?? []).filter((i) => !ideaIds.includes(i.id))
  })
}
