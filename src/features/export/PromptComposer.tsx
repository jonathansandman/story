import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, Check, Copy, Info, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useBundle } from '@/db/hooks'
import { updateStory } from '@/db/repo'
import type { DetailLevel, ExportOptions, PromptFormat } from '@/db/types'
import { buildPrompt, characterSheet, type CharacterOverride } from '@/export/build'
import type { ExportScope } from '@/export/bundle'
import { lintPrompt } from '@/export/lint'
import { render } from '@/export/render'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { estimateTokens, wordCount } from '@/lib/text'
import { Avatar, Button, Segmented, Switch } from '@/components/ui/primitives'
import { Dialog, useToast } from '@/components/ui/overlays'
import { optionsFor } from './composer-context'

const DETAIL_OPTIONS: { value: DetailLevel; label: string; title: string }[] = [
  { value: 'brief', label: 'Brief', title: 'Essence, essential traits, voice, boundaries' },
  { value: 'standard', label: 'Standard', title: '+ personality, wants, desires, sample lines' },
  { value: 'full', label: 'Full', title: '+ every trait and backstory' },
]

const FORMAT_OPTIONS: { value: PromptFormat; label: string; title: string }[] = [
  { value: 'markdown', label: 'Markdown', title: 'Headers and bold labels — best for most chat UIs' },
  { value: 'xml', label: 'XML tags', title: 'Tagged sections — parsed very reliably by most models' },
  { value: 'plain', label: 'Plain', title: 'No markup at all' },
]

export function PromptComposer({ storyId, scope, onClose }: { storyId: string; scope: ExportScope; onClose: () => void }) {
  const bundle = useBundle(storyId)
  const toast = useToast()
  const [options, setOptions] = useState<ExportOptions | null>(null)
  const [overrides, setOverrides] = useState<Record<string, CharacterOverride>>({})
  const [copied, setCopied] = useState(false)
  // On phones the options start collapsed so the preview and Copy button come first.
  const [showOptions, setShowOptions] = useState(false)

  // Initialise once from the story's remembered preferences.
  useEffect(() => {
    if (bundle && !options) setOptions(optionsFor(bundle.story))
  }, [bundle, options])

  const set = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) => {
    setOptions((o) => {
      if (!o) return o
      const next = { ...o, [key]: value }
      void updateStory(storyId, { exportPrefs: next }) // remembered per story
      return next
    })
  }

  const built = useMemo(() => {
    if (!bundle || !options) return null
    // Resolve characters without overrides first so excluded ones can still be listed and re-enabled.
    const base = buildPrompt({ bundle, scope, options })
    const result = buildPrompt({ bundle, scope, options, overrides })
    const out = render(result.doc, options.format)
    return { base, result, out, hints: lintPrompt(bundle, result) }
  }, [bundle, options, overrides, scope])

  const copy = async () => {
    if (!built) return
    await copyText(built.out)
    setCopied(true)
    toast('Prompt copied', `~${estimateTokens(built.out).toLocaleString()} tokens`)
    setTimeout(() => setCopied(false), 1600)
  }

  // ⌘/Ctrl+Enter copies from anywhere in the composer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        void copy()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const tokens = built ? estimateTokens(built.out) : 0

  // Rendered in the desktop sidebar, or inline under "Options" on phones.
  const optionsBody = bundle && options && built && (
    <div className="space-y-6 px-5 py-5">
      <Group label="Format">
        <Segmented value={options.format} onChange={(v) => set('format', v)} options={FORMAT_OPTIONS} size="sm" />
      </Group>

      <Group label="Character detail" hint="Less detail = less prompt bloat. Boundaries are always included.">
        <Segmented value={options.characterDetail} onChange={(v) => set('characterDetail', v)} options={DETAIL_OPTIONS} size="sm" />
      </Group>

      <Group label={`On the page · ${built.base.characterIds.length}`}>
        {built.base.characterIds.length === 0 && <p className="text-[12.5px] text-faint">No characters tagged.</p>}
        <ul className="space-y-1.5">
          {built.base.characterIds.map((id) => {
            const c = bundle.characters.get(id)
            if (!c) return null
            const level = overrides[id] ?? options.characterDetail
            const sheetTokens =
              level === 'exclude' ? 0 : estimateTokens(render({ title: '', sections: [characterSheet(c, level)] }, 'markdown'))
            return (
              <li key={id} className={cn('rounded-lg py-1', level === 'exclude' && 'opacity-50')}>
                <div className="flex items-center gap-2">
                  <Avatar name={c.name} color={c.color} size={22} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{c.name}</span>
                  <span className="text-[11px] text-faint tabular-nums">{sheetTokens ? `~${sheetTokens}t` : 'off'}</span>
                </div>
                <div className="mt-1.5 pl-[30px]">
                  <Segmented
                    size="sm"
                    value={level}
                    onChange={(v) =>
                      setOverrides((o) => {
                        const next = { ...o }
                        if (v === options.characterDetail) delete next[id]
                        else next[id] = v
                        return next
                      })
                    }
                    options={[
                      { value: 'brief', label: 'B', title: 'Brief' },
                      { value: 'standard', label: 'S', title: 'Standard' },
                      { value: 'full', label: 'F', title: 'Full' },
                      { value: 'exclude', label: 'Off', title: 'Leave out of this prompt' },
                    ]}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </Group>

      <Group label="Include">
        <div className="space-y-0.5">
          <Switch checked={options.includeTask} onChange={(v) => set('includeTask', v)} label="Writing instructions" hint="POV, tense, length, where to stop" />
          <Switch checked={options.includeStory} onChange={(v) => set('includeStory', v)} label="Story bible" hint="Premise, heat, style guide, rules" />
          <Switch checked={options.includeRelationships} onChange={(v) => set('includeRelationships', v)} label="Relationship dynamics" hint="Only between characters on the page" />
          <Switch checked={options.includeContinuity} onChange={(v) => set('includeContinuity', v)} label="Story so far" hint="Chapter summaries and beat recaps" />
          <Switch
            checked={options.includePreviousPassage}
            onChange={(v) => set('includePreviousPassage', v)}
            label="End of previous passage"
            hint="Quotes the last ~250 words of prose so it picks up seamlessly"
          />
          <Switch checked={options.includeNextBeat} onChange={(v) => set('includeNextBeat', v)} label="Stop marker" hint="Shows what comes next so the AI doesn't overrun" />
          <Switch checked={options.includeWriterNotes} onChange={(v) => set('includeWriterNotes', v)} label="Private writer notes" hint="Off by default — these are for you" />
        </div>
      </Group>

      <Group label="Extra instructions" hint="Appended to the task. Remembered for this story.">
        <textarea
          value={options.extraInstructions}
          onChange={(e) => set('extraInstructions', e.target.value)}
          rows={3}
          placeholder="e.g. Open on a sensory detail. End on a line of dialogue."
          className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent/60 max-sm:text-[16px]"
        />
      </Group>
    </div>
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Compose prompt" hideHeader className="h-[min(88vh,900px)] max-w-6xl overflow-hidden max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0">
      {!bundle || !options || !built ? (
        <div className="p-10 text-muted">Loading…</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* ── Options ── */}
          <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-r border-line bg-surface-2/40 max-md:hidden">
            <div className="border-b border-line px-5 py-4">
              <div className="flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.08em] text-faint uppercase">
                <Sparkles size={13} /> Compose prompt
              </div>
              <h2 className="mt-1.5 font-serif text-[17px] leading-snug text-ink">{built.result.doc.title}</h2>
            </div>

            {optionsBody}
          </aside>

          {/* ── Preview ── */}
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 md:hidden">
              <h2 className="min-w-0 flex-1 truncate font-serif text-[15px]">{built.result.doc.title}</h2>
              <Button size="sm" variant={showOptions ? 'subtle' : 'ghost'} onClick={() => setShowOptions((v) => !v)}>
                <SlidersHorizontal /> Options
              </Button>
            </div>
            <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 md:px-6">
              <div className="flex items-center gap-4 text-[12.5px] text-muted tabular-nums">
                <span>
                  <strong className="font-semibold text-ink">~{tokens.toLocaleString()}</strong> tokens
                </span>
                <span>{wordCount(built.out).toLocaleString()} words</span>
                <span>{built.result.beats.length} beat{built.result.beats.length === 1 ? '' : 's'}</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
                <Button variant="primary" onClick={copy}>
                  {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy prompt'}
                  <span className="ml-1 hidden text-[11px] opacity-70 sm:inline">⌘↵</span>
                </Button>
              </div>
            </header>

            {showOptions && <div className="max-h-[55dvh] overflow-y-auto border-b border-line bg-surface-2/40 md:hidden">{optionsBody}</div>}

            {built.hints.length > 0 && (
              <div className="border-b border-line bg-surface-2/40 px-4 py-3 md:px-6">
                <p className="mb-1.5 text-[11.5px] font-semibold tracking-[0.08em] text-faint uppercase">Before you send — the AI will have to guess:</p>
                <ul className="space-y-1">
                  {built.hints.slice(0, 5).map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12.5px] text-muted">
                      {h.level === 'warn' ? <AlertCircle size={14} className="mt-0.5 shrink-0 text-warn" /> : <Info size={14} className="mt-0.5 shrink-0 text-faint" />}
                      {h.message}
                    </li>
                  ))}
                  {built.hints.length > 5 && <li className="pl-6 text-[12px] text-faint">+{built.hints.length - 5} more</li>}
                </ul>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto bg-surface px-4 py-5 md:px-6">
              <PromptPreview text={built.out} format={options.format} />
            </div>
          </section>
        </div>
      )}
    </Dialog>
  )
}

function Group({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[12px] font-medium text-ink">{label}</div>
      {children}
      {hint && <p className="mt-1.5 text-[11.5px] leading-snug text-faint">{hint}</p>}
    </div>
  )
}

/** Light syntax colouring so the structure of the prompt is scannable. */
export function PromptPreview({ text, format }: { text: string; format: PromptFormat }) {
  const lines = useMemo(() => text.split('\n'), [text])
  return (
    <pre className="font-mono text-[12.5px] leading-[1.7] whitespace-pre-wrap text-ink/90">
      {lines.map((line, i) => (
        <PreviewLine key={i} line={line} format={format} />
      ))}
    </pre>
  )
}

function PreviewLine({ line, format }: { line: string; format: PromptFormat }) {
  if (format === 'markdown') {
    const h = /^(#{1,6}) (.*)$/.exec(line)
    if (h) {
      const depth = h[1]!.length
      return (
        <span className={cn('block font-semibold', depth <= 2 ? 'mt-3 text-accent' : 'mt-1 text-ink')}>
          <span className="text-faint">{h[1]} </span>
          {h[2]}
          {'\n'}
        </span>
      )
    }
    const f = /^\*\*(.+?):\*\*(.*)$/.exec(line)
    if (f)
      return (
        <span>
          <span className="font-semibold text-muted">**{f[1]}:**</span>
          {f[2]}
          {'\n'}
        </span>
      )
  }
  if (format === 'xml') {
    const parts = line.split(/(<\/?[a-z_]+(?: [^>]*)?>)/g)
    return (
      <span>
        {parts.map((p, i) => (p.startsWith('<') ? <span key={i} className="text-accent/80">{p}</span> : p))}
        {'\n'}
      </span>
    )
  }
  if (format === 'plain' && /^(== .* ==|-- .* --)$/.test(line))
    return (
      <span className="font-semibold text-accent">
        {line}
        {'\n'}
      </span>
    )
  return (
    <span>
      {line}
      {'\n'}
    </span>
  )
}
