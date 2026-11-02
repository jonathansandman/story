import { useState, type ReactNode } from 'react'
import { ClipboardPaste, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import { relativeTime } from '@/lib/text'
import { Button } from '@/components/ui/primitives'
import { Sheet } from '@/components/ui/overlays'
import { useAi, usePending } from './ai-context'

export interface AssistantAction {
  icon: ReactNode
  label: string
  detail?: string
  run: () => void
}

/**
 * The one door to AI. Each screen passes the actions that make sense there;
 * a pending Grok request always comes first, so returning from Grok is one tap.
 */
export function AssistantButton({ actions }: { actions: AssistantAction[] }) {
  const [open, setOpen] = useState(false)
  const pending = usePending()
  const { openImport } = useAi()
  const all: (AssistantAction & { hl?: boolean })[] = [
    ...(pending
      ? [{ icon: <ClipboardPaste />, label: 'Paste Grok’s reply', detail: `${pending.title} · ${relativeTime(pending.at)}`, run: openImport, hl: true }]
      : []),
    ...actions,
    ...(pending ? [] : [{ icon: <ClipboardPaste />, label: 'Paste an AI reply', run: openImport }]),
  ]
  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="AI assistant" className="relative text-accent">
        <Sparkles />
        {pending && <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-bg" />}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="AI">
        <ul className="overflow-y-auto p-2">
          {all.map((a, i) => (
            <li key={i}>
              <button
                onClick={() => {
                  setOpen(false)
                  a.run()
                }}
                className={cn(
                  'flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors [&_svg]:size-[18px]',
                  a.hl ? 'bg-accent-soft' : 'hover:bg-surface-2',
                )}
              >
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', a.hl ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-accent')}>{a.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium text-ink">{a.label}</span>
                  {a.detail && <span className="block truncate text-[13px] text-faint">{a.detail}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  )
}

/** Slim reminder under the top bar while a reply is pending. */
export function PendingBanner() {
  const pending = usePending()
  const { openImport } = useAi()
  if (!pending) return null
  return (
    <button onClick={openImport} className="flex h-10 shrink-0 items-center gap-2 bg-accent-soft px-4 text-left text-[13.5px] text-accent">
      <ClipboardPaste size={15} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        Waiting for Grok · <span className="text-ink/80">{pending.title}</span>
      </span>
      <span className="font-semibold">Paste</span>
    </button>
  )
}
