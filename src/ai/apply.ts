import { db, type TrellisDB } from '@/db/db'
import { exportBackup, takeSnapshot } from '@/db/repo'
import type { Beat, Chapter, Character, Relationship, Story } from '@/db/types'
import type { DataState, Plan } from './plan'

/** Current data in the shape the planner needs. */
export async function loadState(database: TrellisDB = db): Promise<DataState> {
  const [backup, drafts] = await Promise.all([exportBackup(database), database.drafts.toArray()])
  const live = new Set(drafts.map((d) => d.id))
  return {
    stories: backup.stories,
    characters: backup.characters,
    relationships: backup.relationships,
    chapters: backup.chapters,
    beats: backup.beats,
    beatsWithProse: new Set(backup.beats.filter((b) => b.activeDraftId && live.has(b.activeDraftId)).map((b) => b.id)),
  }
}

/**
 * Write the selected parts of a plan in one transaction, after taking a
 * snapshot so the whole import can be undone from Settings.
 *
 * If the user unticked a *new* character, every reference to it (cast, POV,
 * chapter/beat characters, relationships) is dropped so nothing dangles.
 */
/** Returns the id of the snapshot taken first (for Undo), if any. */
export async function applyPlan(plan: Plan, selected: Set<string>, opts: { snapshot?: boolean; database?: TrellisDB } = {}): Promise<string | null> {
  const database = opts.database ?? db
  const snapshotId = opts.snapshot !== false ? await takeSnapshot('Before AI import') : null

  const chosen = plan.changes.filter((c) => c.required || selected.has(c.key))
  const skippedNewChars = new Set(
    plan.changes.filter((c) => c.group === 'character' && c.op === 'create' && !chosen.includes(c)).map((c) => c.row.id),
  )
  const ok = (id: string | null) => !!id && !skippedNewChars.has(id)

  await database.transaction(
    'rw',
    [database.stories, database.characters, database.relationships, database.chapters, database.beats, database.drafts],
    async () => {
      for (const c of chosen) {
        switch (c.group) {
          case 'story': {
            const s = structuredClone(c.row as Story)
            s.cast = s.cast.filter((m) => ok(m.characterId))
            await database.stories.put(s)
            break
          }
          case 'character':
            await database.characters.put(c.row as Character)
            break
          case 'relationship': {
            const r = c.row as Relationship
            if (r.characterIds.every(ok)) await database.relationships.put(r)
            break
          }
          case 'chapter': {
            const ch = structuredClone(c.row as Chapter)
            ch.characterIds = ch.characterIds.filter(ok)
            if (!ok(ch.povCharacterId)) ch.povCharacterId = null
            await database.chapters.put(ch)
            const beatOn = (key: string) => selected.has(key)
            for (const bc of c.beats ?? []) {
              if (!beatOn(bc.key)) continue
              if (bc.op === 'delete') {
                await database.drafts.where('beatId').equals(bc.row.id).delete()
                await database.beats.delete(bc.row.id)
              } else {
                const b: Beat = { ...bc.row, characterIds: bc.row.characterIds.filter(ok) }
                await database.beats.put(b)
              }
            }
            // Final order: drop new beats that were unticked; put back deletions that were unticked.
            const skippedNew = new Set((c.beats ?? []).filter((b) => b.op === 'create' && !beatOn(b.key)).map((b) => b.row.id))
            const order = (c.beatOrder ?? []).filter((id) => !skippedNew.has(id))
            const keptDeletes = (c.beats ?? []).filter((b) => b.op === 'delete' && !beatOn(b.key)).sort((a, b) => a.row.order - b.row.order)
            if (keptDeletes.length) {
              const original = (await database.beats.where('chapterId').equals(ch.id).toArray()).sort((a, b) => a.order - b.order).map((b) => b.id)
              for (const d of keptDeletes) {
                const before = original.slice(0, original.indexOf(d.row.id)).reverse().find((id) => order.includes(id))
                order.splice(before ? order.indexOf(before) + 1 : 0, 0, d.row.id)
              }
            }
            await Promise.all(order.map((id, i) => database.beats.update(id, { order: i })))
            break
          }
        }
      }

      // Chapter order (when new chapters were placed between existing ones).
      if (plan.chapterOrder) {
        const skipped = new Set(plan.changes.filter((c) => c.group === 'chapter' && c.op === 'create' && !chosen.includes(c)).map((c) => c.row.id))
        await Promise.all(plan.chapterOrder.filter((id) => !skipped.has(id)).map((id, i) => database.chapters.update(id, { order: i })))
      }
    },
  )
  return snapshotId
}
