import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_EXPORT_OPTIONS } from '@/db/factories'
import { loadBundle } from '@/db/hooks'
import type { ExportOptions, Story } from '@/db/types'
import { buildPrompt } from '@/export/build'
import type { ExportScope } from '@/export/bundle'
import { render } from '@/export/render'
import { copyText } from '@/lib/clipboard'
import { estimateTokens } from '@/lib/text'
import { useToast } from '@/components/ui/overlays'
import { PromptComposer } from './PromptComposer'

/**
 * Two ways to export, sharing one engine:
 *   quickCopy(storyId, scope)   → builds with the story's saved prefs and copies immediately
 *   openComposer(storyId, scope) → opens the composer for live tweaking + preview
 */

interface ComposerApi {
  quickCopy: (storyId: string, scope: ExportScope) => Promise<void>
  openComposer: (storyId: string, scope: ExportScope) => void
}

const Ctx = createContext<ComposerApi | null>(null)

export function useComposer(): ComposerApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useComposer must be used inside <ComposerProvider>')
  return v
}

const GLOBAL_PREFS_KEY = 'trellis.exportDefaults'

export function getGlobalExportDefaults(): ExportOptions {
  try {
    const raw = localStorage.getItem(GLOBAL_PREFS_KEY)
    if (raw) return { ...DEFAULT_EXPORT_OPTIONS, ...(JSON.parse(raw) as Partial<ExportOptions>) }
  } catch {
    /* ignore */
  }
  return DEFAULT_EXPORT_OPTIONS
}

export function setGlobalExportDefaults(opts: ExportOptions) {
  try {
    localStorage.setItem(GLOBAL_PREFS_KEY, JSON.stringify(opts))
  } catch {
    /* ignore */
  }
}

/** Effective options = app defaults ← story's saved prefs. */
export function optionsFor(story: Story): ExportOptions {
  return { ...getGlobalExportDefaults(), ...(story.exportPrefs ?? {}) }
}

export function ComposerProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [target, setTarget] = useState<{ storyId: string; scope: ExportScope } | null>(null)

  const quickCopy = useCallback(
    async (storyId: string, scope: ExportScope) => {
      const bundle = await loadBundle(storyId)
      if (!bundle) return
      const options = optionsFor(bundle.story)
      const { doc } = buildPrompt({ bundle, scope, options })
      const out = render(doc, options.format)
      await copyText(out)
      const label = scope.kind === 'beat' ? 'Beat prompt copied' : scope.kind === 'chapter' ? 'Chapter prompt copied' : 'Selection copied'
      toast(label, `~${estimateTokens(out).toLocaleString()} tokens`)
    },
    [toast],
  )

  const api = useMemo<ComposerApi>(
    () => ({ quickCopy, openComposer: (storyId, scope) => setTarget({ storyId, scope }) }),
    [quickCopy],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      {target && <PromptComposer storyId={target.storyId} scope={target.scope} onClose={() => setTarget(null)} />}
    </Ctx.Provider>
  )
}
