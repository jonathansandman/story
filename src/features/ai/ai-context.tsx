import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AiDialog, type AiDialogStart } from './AiDialog'

/**
 * Global entry point for the AI round-trip. Anywhere in the app can call
 * `openAi({ kind: 'chapter', chapterId })` to start a request, or
 * `openImport()` to paste a reply back.
 */
interface AiApi {
  openAi: (start: AiDialogStart) => void
  openImport: () => void
}

const Ctx = createContext<AiApi | null>(null)

export function useAi(): AiApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAi must be used inside <AiProvider>')
  return v
}

export function AiProvider({ children }: { children: ReactNode }) {
  const [start, setStart] = useState<AiDialogStart | null>(null)
  const openAi = useCallback((s: AiDialogStart) => setStart(s), [])
  const openImport = useCallback(() => setStart({ kind: 'import' }), [])
  const api = useMemo(() => ({ openAi, openImport }), [openAi, openImport])
  return (
    <Ctx.Provider value={api}>
      {children}
      {start && <AiDialog start={start} onClose={() => setStart(null)} />}
    </Ctx.Provider>
  )
}

/* ───── Pending request: survives app-switching / page reloads on phones ───── */

export interface PendingRequest {
  title: string
  targetStoryId: string | null
  at: number
  /** For a weave request: the inbox ideas it covers, removed once applied. */
  ideaIds?: string[]
}

const KEY = 'trellis.aiPending'
const MAX_AGE = 1000 * 60 * 60 * 24 * 3

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function savePending(p: PendingRequest) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
  notify()
}

let cache: { raw: string | null; value: PendingRequest | null } = { raw: null, value: null }
export function loadPending(): PendingRequest | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === cache.raw) return cache.value
    const p = raw ? (JSON.parse(raw) as PendingRequest) : null
    cache = { raw, value: p && Date.now() - p.at < MAX_AGE ? p : null }
    return cache.value
  } catch {
    return null
  }
}

export function clearPending() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  notify()
}

/** The AI request waiting for a pasted reply, if any. Reactive. */
export function usePending(): PendingRequest | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      window.addEventListener('storage', cb)
      return () => {
        listeners.delete(cb)
        window.removeEventListener('storage', cb)
      }
    },
    loadPending,
  )
}
