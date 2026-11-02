import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { chaptersOf } from './repo'
import type { Beat, Draft } from './types'
import { makeBundle, type StoryBundle } from '@/export/bundle'

/**
 * Reactive read hooks. Each re-renders automatically when the underlying
 * IndexedDB rows change — in this tab or another one.
 * `undefined` means "still loading"; `null` means "not found".
 */

export const useCharacters = () => useLiveQuery(() => db.characters.orderBy('name').toArray(), [])

export const useCharacter = (id: string | undefined) =>
  useLiveQuery(async () => (id ? ((await db.characters.get(id)) ?? null) : null), [id])

export const useRelationships = () => useLiveQuery(() => db.relationships.toArray(), [])

export const useStories = () => useLiveQuery(() => db.stories.orderBy('updatedAt').reverse().toArray(), [])

export const useStory = (id: string | undefined) =>
  useLiveQuery(async () => (id ? ((await db.stories.get(id)) ?? null) : null), [id])

export const useChapters = (storyId: string | undefined) =>
  useLiveQuery(() => (storyId ? chaptersOf(storyId) : []), [storyId])

/** All beats of a story, grouped by chapter and sorted. */
export const useStoryBeats = (storyId: string | undefined) =>
  useLiveQuery(async () => {
    const map = new Map<string, Beat[]>()
    if (!storyId) return map
    const beats = await db.beats.where('storyId').equals(storyId).toArray()
    for (const b of beats.sort((a, b) => a.order - b.order)) {
      const list = map.get(b.chapterId) ?? []
      list.push(b)
      map.set(b.chapterId, list)
    }
    return map
  }, [storyId])

export const useSnapshots = () => useLiveQuery(() => db.snapshots.orderBy('createdAt').reverse().toArray(), [])

/** Load everything the prompt builder needs for a story (one-shot, not reactive). */
export async function loadBundle(storyId: string): Promise<StoryBundle | null> {
  const story = await db.stories.get(storyId)
  if (!story) return null
  const [chapters, beats, characters, relationships, drafts] = await Promise.all([
    chaptersOf(storyId),
    db.beats.where('storyId').equals(storyId).toArray(),
    db.characters.toArray(),
    db.relationships.toArray(),
    db.drafts.where('storyId').equals(storyId).toArray(),
  ])
  return makeBundle({ story, chapters, beats, characters, relationships, drafts })
}

/** Reactive bundle — used by the composer for live preview. */
export const useBundle = (storyId: string | undefined) =>
  useLiveQuery(() => (storyId ? loadBundle(storyId) : null), [storyId])

/** All versions of a beat's prose, newest first. */
export const useDrafts = (beatId: string | undefined) =>
  useLiveQuery(async () => (beatId ? (await db.drafts.where('beatId').equals(beatId).sortBy('createdAt')).reverse() : []), [beatId])

/** Active drafts for a whole story: beatId → draft. Used for word counts and the reading view. */
export const useStoryProse = (storyId: string | undefined) =>
  useLiveQuery(async () => {
    const out = new Map<string, Draft>()
    if (!storyId) return out
    const [beats, drafts] = await Promise.all([db.beats.where('storyId').equals(storyId).toArray(), db.drafts.where('storyId').equals(storyId).toArray()])
    const byId = new Map(drafts.map((d) => [d.id, d]))
    for (const b of beats) {
      const d = b.activeDraftId ? byId.get(b.activeDraftId) : undefined
      if (d) out.set(b.id, d)
    }
    return out
  }, [storyId])
