import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
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
}

const KEY = 'trellis.aiPending'
const MAX_AGE = 1000 * 60 * 60 * 24 * 3

export function savePending(p: PendingRequest) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

export function loadPending(): PendingRequest | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as PendingRequest
    return Date.now() - p.at < MAX_AGE ? p : null
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
}
