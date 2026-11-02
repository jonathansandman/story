import { useState } from 'react'
import { Check, ClipboardPaste, Copy, ExternalLink } from 'lucide-react'
import { copyText, readClipboard } from '@/lib/clipboard'
import { estimateTokens } from '@/lib/text'
import { Button } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/overlays'

export const GROK_URL = 'https://grok.com/'

/**
 * The middle of every AI round-trip, on one screen: the prompt is already
 * copied → open Grok → paste the reply back. Fewer taps than separate steps,
 * which matters on a phone.
 */
export function SendStep({
  prompt,
  reply,
  onReply,
  error,
  status,
}: {
  prompt: string | null
  reply: string
  onReply: (text: string) => void
  error?: string | null
  /** e.g. "Found 12 changes" once the reply parses. */
  status?: React.ReactNode
}) {
  const toast = useToast()
  const [showPrompt, setShowPrompt] = useState(false)

  const paste = async () => {
    const t = await readClipboard()
    if (t?.trim()) onReply(t)
    else toast('Couldn’t read the clipboard', 'long-press the box below → Paste')
  }

  return (
    <div className="space-y-5">
      {prompt && (
        <div className="rounded-2xl bg-surface-2/70 p-4">
          <p className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
            <Check size={15} className="text-ok" /> Prompt copied
            <span className="font-normal text-faint">· ~{estimateTokens(prompt).toLocaleString()} tokens</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={GROK_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8.5 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium shadow-soft hover:bg-surface-2"
            >
              <ExternalLink size={15} /> Open Grok
            </a>
            <Button
              variant="ghost"
              onClick={async () => {
                await copyText(prompt)
                toast('Copied again')
              }}
            >
              <Copy /> Copy again
            </Button>
            <Button variant="ghost" onClick={() => setShowPrompt((v) => !v)}>
              {showPrompt ? 'Hide prompt' : 'Show prompt'}
            </Button>
          </div>
          {showPrompt && (
            <pre className="mt-3 max-h-64 overflow-auto rounded-xl border border-line bg-surface px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted">{prompt}</pre>
          )}
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center gap-2">
          <Button variant="primary" onClick={paste}>
            <ClipboardPaste /> Paste Grok’s reply
          </Button>
          {reply && (
            <Button variant="ghost" onClick={() => onReply('')}>
              Clear
            </Button>
          )}
        </div>
        <textarea
          value={reply}
          onChange={(e) => onReply(e.target.value)}
          rows={reply ? 4 : 3}
          placeholder="…or long-press here → Paste"
          className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[12px] leading-relaxed text-muted outline-none focus:border-accent/60 max-sm:text-[16px]"
        />
        {error && <p className="mt-2 rounded-xl bg-warn/10 px-4 py-3 text-[13px] text-ink ring-1 ring-warn/30">{error}</p>}
        {status && !error && <div className="mt-2 text-[13px] text-muted">{status}</div>}
      </div>
    </div>
  )
}
