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
export async function applyPlan(plan: Plan, selected: Set<string>, opts: { snapshot?: boolean; database?: TrellisDB } = {}) {
  const database = opts.database ?? db
  if (opts.snapshot !== false) await takeSnapshot('Before AI import')

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
            for (const bc of c.beats ?? []) {
              if (bc.op === 'delete') {
                await database.drafts.where('beatId').equals(bc.row.id).delete()
                await database.beats.delete(bc.row.id)
              } else {
                const b: Beat = { ...bc.row, characterIds: bc.row.characterIds.filter(ok) }
                await database.beats.put(b)
              }
            }
            // Apply the final ordering to every beat in the chapter.
            const order = c.beatOrder ?? []
            await Promise.all(order.map((id, i) => database.beats.update(id, { order: i })))
            break
          }
        }
      }
    },
  )
}
