import { useMemo, useState } from 'react'
import { AlertTriangle, ClipboardPaste, Copy, ExternalLink, Wand2 } from 'lucide-react'
import { loadBundle } from '@/db/hooks'
import { buildPolishPrompt } from '@/export/polish'
import { copyText } from '@/lib/clipboard'
import { findRepeats } from '@/lib/repeats'
import { estimateTokens } from '@/lib/text'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/overlays'
import { GROK_URL } from '@/features/ai/SendStep'

/** Flags phrases a draft leans on too often. Local, instant, no AI. */
export function RepeatsNote({ text, min = 3 }: { text: string; min?: number }) {
  const repeats = useMemo(() => findRepeats(text, { min, max: 6 }), [text, min])
  if (!repeats.length) return null
  return (
    <div className="flex gap-2 rounded-xl bg-warn/8 px-3 py-2 text-[12.5px] leading-snug ring-1 ring-warn/25">
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
      <p className="text-muted">
        <span className="font-medium text-ink">Repeats:</span>{' '}
        {repeats.map((r, i) => (
          <span key={r.phrase}>
            {i > 0 && ', '}“{r.phrase}” <span className="text-faint">×{r.count}</span>
          </span>
        ))}
      </p>
    </div>
  )
}

/**
 * "Polish with AI": copies a revision prompt (draft + plan + style + the
 * exact repeats to fix + optional feedback), then takes the revised text back
 * as a new version.
 */
export function PolishBox({
  storyId,
  beatIds,
  label,
  onPaste,
  defaultOpen = false,
}: {
  storyId: string
  beatIds: string[]
  /** "beat" or "chapter", for button labels. */
  label: string
  onPaste: () => void
  defaultOpen?: boolean
}) {
  const toast = useToast()
  const [open, setOpen] = useState(defaultOpen)
  const [feedback, setFeedback] = useState('')
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const bundle = await loadBundle(storyId)
    if (!bundle) return
    const prompt = buildPolishPrompt(bundle, beatIds, feedback)
    if (!prompt) {
      toast('Nothing to polish yet')
      return
    }
    await copyText(prompt)
    setCopied(true)
    toast('Polish prompt copied', `~${estimateTokens(prompt).toLocaleString()} tokens`)
  }

  if (!open)
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Wand2 /> Polish {label} with AI
      </Button>
    )

  return (
    <div className={cn('space-y-3', !defaultOpen && 'rounded-xl border border-line bg-surface-2/50 p-4')}>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={2}
        placeholder="Notes for the polish (optional)"
        className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] outline-none focus:border-accent/60 max-sm:text-[16px]"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={copied ? 'secondary' : 'primary'} onClick={copy}>
          <Copy /> Copy polish prompt
        </Button>
        <a href={GROK_URL} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] text-muted hover:bg-surface-2 hover:text-ink">
          <ExternalLink size={13} /> Grok
        </a>
        <Button size="sm" variant={copied ? 'primary' : 'secondary'} onClick={onPaste}>
          <ClipboardPaste /> Paste polished {label}
        </Button>
        {!defaultOpen && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        )}
      </div>
    </div>
  )
}
