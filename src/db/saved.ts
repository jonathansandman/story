import { useSyncExternalStore } from 'react'
import { db } from './db'

/**
 * A tiny "last saved" signal driven by database writes, so the UI can show
 * that autosave happened without every component reporting its own saves.
 */
let last = 0
const listeners = new Set<() => void>()
const emit = () => {
  last = Date.now()
  listeners.forEach((l) => l())
}

for (const table of [db.characters, db.relationships, db.stories, db.chapters, db.beats, db.drafts]) {
  table.hook('creating', () => void queueMicrotask(emit))
  table.hook('updating', () => void queueMicrotask(emit))
  table.hook('deleting', () => void queueMicrotask(emit))
}

export function useLastSaved(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => last,
  )
}
