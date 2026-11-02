import { db } from './db'
import { autoSnapshot, importBackup } from './repo'
import { buildSeed } from './seed'

const SEEDED_KEY = 'trellis.seeded'

/** First-run seeding plus a periodic automatic snapshot. Safe to call repeatedly. */
export async function bootstrap() {
  let seeded = false
  try {
    seeded = localStorage.getItem(SEEDED_KEY) === '1'
  } catch {
    /* storage blocked — fall through to the emptiness check */
  }
  const empty = (await db.stories.count()) === 0 && (await db.characters.count()) === 0
  if (!seeded && empty) await importBackup(buildSeed())
  try {
    localStorage.setItem(SEEDED_KEY, '1')
  } catch {
    /* ignore */
  }
  await autoSnapshot()
  // Ask the browser not to evict our data under storage pressure (best effort).
  void navigator.storage?.persist?.().catch(() => undefined)
}

export async function resetToExample() {
  await importBackup(buildSeed())
}
