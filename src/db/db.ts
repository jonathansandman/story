import Dexie, { type EntityTable } from 'dexie'
import type { Beat, Chapter, Character, Draft, Relationship, Snapshot, Story } from './types'

/**
 * IndexedDB via Dexie. All user data lives in the browser; nothing leaves the
 * device unless the user exports it.
 *
 * Schema strings list only *indexed* fields — every other property is stored
 * but not indexed. Bump the version and add an `.upgrade()` for migrations.
 */
export class TrellisDB extends Dexie {
  characters!: EntityTable<Character, 'id'>
  relationships!: EntityTable<Relationship, 'id'>
  stories!: EntityTable<Story, 'id'>
  chapters!: EntityTable<Chapter, 'id'>
  beats!: EntityTable<Beat, 'id'>
  snapshots!: EntityTable<Snapshot, 'id'>
  drafts!: EntityTable<Draft, 'id'>

  constructor(name = 'trellis') {
    super(name)
    this.version(1).stores({
      characters: 'id, name, updatedAt, *tags',
      relationships: 'id, *characterIds',
      stories: 'id, title, updatedAt, status',
      chapters: 'id, storyId, [storyId+order]',
      beats: 'id, storyId, chapterId, [chapterId+order]',
      snapshots: 'id, createdAt',
    })
    // v2: prose drafts per beat.
    this.version(2)
      .stores({ drafts: 'id, beatId, storyId, createdAt' })
      .upgrade((tx) =>
        tx
          .table('beats')
          .toCollection()
          .modify((b: Partial<Beat>) => {
            b.activeDraftId ??= null
          }),
      )
    // v3: story themes + ideas inbox.
    this.version(3)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('stories')
          .toCollection()
          .modify((s: Partial<Story>) => {
            s.themes ??= []
            s.ideas ??= []
          }),
      )
  }
}

export const SCHEMA_VERSION = 3

export const db = new TrellisDB()
