import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, Check, ClipboardPaste, Copy, ExternalLink, Sparkles, Wand2 } from 'lucide-react'
import { useCharacters, useStories } from '@/db/hooks'
import { applyPlan, loadState } from '@/ai/apply'
import { parseReply } from '@/ai/patch'
import { planPatch, type Plan } from '@/ai/plan'
import { buildAiRequest, type AiRequest } from '@/ai/requests'
import { copyText, readClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { estimateTokens } from '@/lib/text'
import { Button, Field, Segmented, Select, Switch } from '@/components/ui/primitives'
import { Dialog, useToast } from '@/components/ui/overlays'
import { CharacterChips } from '@/features/characters/CharacterPicker'
import { clearPending, loadPending, savePending } from './ai-context'
import { ImportPreview } from './ImportPreview'

export type AiDialogStart =
  | { kind: 'import' }
  | { kind: 'new-story' }
  | { kind: 'new-character'; storyId?: string | null }
  | { kind: 'story'; storyId: string }
  | { kind: 'character'; characterId: string }
  | { kind: 'chapter'; chapterId: string; instruction?: string }
  | { kind: 'beat'; beatId: string }

type Step = 'ask' | 'sent' | 'paste' | 'review'

const SUGGESTIONS: Record<string, string[]> = {
  story: [
    'Write a vivid style guide for the prose.',
    'Sharpen the logline and premise.',
    'Outline the remaining chapters with 3–6 beats each.',
    'Deepen every relationship: dynamic, tension, consent.',
    'Fill in anything that’s missing or thin.',
  ],
  character: [
    'Fill in everything that’s missing, in depth.',
    'Make their voice more distinctive and add 3 sample lines.',
    'Expand desires and boundaries — specific, not generic.',
    'Give them a sharper contradiction at their core.',
  ],
  chapter: [
    'Plan 4–6 beats for this chapter.',
    'Fill in emotion, tone and pacing for every beat.',
    'Slow this chapter down: split the key moments into smaller beats.',
    'Raise the tension — rework the beats so something is at stake in each.',
    'Write a summary and purpose for this chapter.',
  ],
  beat: [
    'Make the emotional state specific for each character.',
    'Split this into two or three smaller beats.',
    'Add concrete must-include details and a must-avoid.',
    'Make this beat more charged and intimate, without rushing.',
  ],
}

const GROK_URL = 'https://grok.com/'

export function AiDialog({ start, onClose }: { start: AiDialogStart; onClose: () => void }) {
  const stories = useStories()
  const characters = useCharacters()
  const charMap = useMemo(() => new Map((characters ?? []).map((c) => [c.id, c])), [characters])
  const toast = useToast()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>(start.kind === 'import' ? 'paste' : 'ask')
  const [instruction, setInstruction] = useState(start.kind === 'chapter' ? (start.instruction ?? '') : '')
  const [includeOutline, setIncludeOutline] = useState(false)
  // new story
  const [overview, setOverview] = useState('')
  const [useChars, setUseChars] = useState<string[]>([])
  const [chapterCount, setChapterCount] = useState<string>('auto')
  const [beatsPer, setBeatsPer] = useState('3–6')
  // prompt / import
  const [prompt, setPrompt] = useState<{ text: string; title: string } | null>(null)
  const [targetStoryId, setTargetStoryId] = useState<string | null>(() => (start.kind === 'import' ? (loadPending()?.targetStoryId ?? null) : null))
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const [plan, setPlan] = useState<Plan | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const kind = start.kind
  const askReady =
    kind === 'new-story' ? overview.trim().length > 0 : kind === 'new-character' ? instruction.trim().length > 0 : kind === 'import' ? false : instruction.trim().length > 0

  const toRequest = (): AiRequest | null => {
    switch (start.kind) {
      case 'new-story':
        return { kind: 'new-story', overview, characterIds: useChars, chapters: chapterCount === 'auto' ? null : Number(chapterCount), beatsPerChapter: beatsPer }
      case 'new-character':
        return { kind: 'new-character', idea: instruction, storyId: start.storyId ?? null }
      case 'story':
        return { kind: 'story', storyId: start.storyId, instruction, includeOutline }
      case 'character':
        return { kind: 'character', characterId: start.characterId, instruction }
      case 'chapter':
        return { kind: 'chapter', chapterId: start.chapterId, instruction }
      case 'beat':
        return { kind: 'beat', beatId: start.beatId, instruction }
      default:
        return null
    }
  }

  const makePrompt = async () => {
    const req = toRequest()
    if (!req) return
    const built = buildAiRequest(req, await loadState())
    await copyText(built.prompt)
    setPrompt({ text: built.prompt, title: built.title })
    setTargetStoryId(built.targetStoryId)
    savePending({ title: built.title, targetStoryId: built.targetStoryId, at: Date.now() })
    setStep('sent')
  }

  /* Parse + plan whenever the reply or target changes. */
  useEffect(() => {
    if (!reply.trim()) {
      setError(null)
      setPlan(null)
      return
    }
    let cancelled = false
    const result = parseReply(reply)
    if (!result.patch) {
      setError(result.error ?? 'Couldn’t read that reply.')
      setPlan(null)
      return
    }
    setError(null)
    setParseWarnings(result.warnings)
    void loadState().then((state) => {
      if (cancelled) return
      const p = planPatch(result.patch!, state, { targetStoryId })
      setPlan(p)
      setSelected(new Set(p.changes.map((c) => c.key)))
    })
    return () => {
      cancelled = true
    }
  }, [reply, targetStoryId])

  const pasteReply = async () => {
    const text = await readClipboard()
    if (!text?.trim()) {
      toast('Couldn’t read the clipboard', 'paste into the box instead')
      return
    }
    setReply(text)
  }

  const apply = async () => {
    if (!plan) return
    setBusy(true)
    try {
      await applyPlan(plan, selected)
      clearPending()
      const n = plan.changes.filter((c) => c.required || selected.has(c.key)).length
      toast('Imported', `${n} change${n === 1 ? '' : 's'} applied · undo from Settings → Snapshots`)
      onClose()
      const firstChapter = plan.changes.find((c) => c.group === 'chapter' && selected.has(c.key))
      const chars = plan.changes.filter((c) => c.group === 'character' && selected.has(c.key))
      if (plan.targetStoryId && (plan.storyIsNew || firstChapter || plan.changes.some((c) => c.group === 'story')))
        navigate(`/stories/${plan.targetStoryId}${firstChapter ? `?chapter=${firstChapter.row.id}` : ''}`)
      else if (chars.length === 1) navigate(`/characters/${chars[0]!.row.id}`)
    } catch (e) {
      toast('Import failed', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const subject = (() => {
    if (start.kind === 'story') return stories?.find((s) => s.id === start.storyId)?.title || 'this story'
    if (start.kind === 'character') return charMap.get(start.characterId)?.name || 'this character'
    if (start.kind === 'chapter') return 'this chapter'
    if (start.kind === 'beat') return 'this beat'
    return ''
  })()

  const heading =
    kind === 'import'
      ? 'Import an AI reply'
      : kind === 'new-story'
        ? 'Plan a new story with AI'
        : kind === 'new-character'
          ? 'Create a character with AI'
          : `Edit ${subject} with AI`

  const steps: { id: Step; label: string }[] = [
    ...(kind === 'import' ? [] : [{ id: 'ask' as Step, label: 'Ask' }, { id: 'sent' as Step, label: 'Send' }]),
    { id: 'paste', label: 'Paste reply' },
    { id: 'review', label: 'Review' },
  ]
  const stepIndex = steps.findIndex((s) => s.id === step)

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={heading}
      hideHeader
      className="h-[min(88vh,860px)] max-w-2xl overflow-hidden max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0"
    >
      {/* Header */}
      <div className="border-b border-line px-5 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-serif text-[19px]">
            <Wand2 size={17} className="text-accent" /> {heading}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <ol className="mt-3 flex items-center gap-2 text-[11.5px]">
          {steps.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10.5px] font-semibold',
                  i < stepIndex ? 'bg-ok text-white' : i === stepIndex ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-faint',
                )}
              >
                {i < stepIndex ? <Check size={11} strokeWidth={3} /> : i + 1}
              </span>
              <span className={i === stepIndex ? 'font-medium text-ink' : 'text-faint'}>{s.label}</span>
              {i < steps.length - 1 && <span className="h-px w-4 bg-line-strong" />}
            </li>
          ))}
        </ol>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {/* ── 1. Ask ── */}
        {step === 'ask' && (
          <div className="space-y-5">
            {kind === 'new-story' && (
              <>
                <Field label="Describe your story" hint="As much or as little as you like: premise, vibe, characters, heat, setting, how it ends. The AI fills in the rest — you'll review everything before it's added.">
                  <textarea
                    autoFocus
                    value={overview}
                    onChange={(e) => setOverview(e.target.value)}
                    rows={8}
                    placeholder="A slow-burn story about two rival chefs forced to share a kitchen for a summer in Lisbon. She's guarded, he's reckless…"
                    className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[14.5px] leading-relaxed outline-none focus:border-accent/60"
                  />
                </Field>
                <Field label="Use characters from your library (optional)">
                  <CharacterChips ids={useChars} characters={charMap} onChange={setUseChars} placeholder="Pick existing characters" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Chapters">
                    <Segmented
                      size="sm"
                      value={chapterCount}
                      onChange={setChapterCount}
                      options={['auto', '3', '5', '8', '12'].map((v) => ({ value: v, label: v === 'auto' ? 'Auto' : v }))}
                    />
                  </Field>
                  <Field label="Beats per chapter">
                    <Segmented size="sm" value={beatsPer} onChange={setBeatsPer} options={['2–4', '3–6', '5–8'].map((v) => ({ value: v, label: v }))} />
                  </Field>
                </div>
              </>
            )}

            {kind === 'new-character' && (
              <Field label="Who is this person?" hint="A name, a vibe, a role, a few details — the AI builds the full profile.">
                <textarea
                  autoFocus
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={6}
                  placeholder="Her ex-husband: charming, a little dangerous, still in love with her…"
                  className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[14.5px] leading-relaxed outline-none focus:border-accent/60"
                />
              </Field>
            )}

            {(kind === 'story' || kind === 'character' || kind === 'chapter' || kind === 'beat') && (
              <>
                <Field label="What should change?" hint="Plain words. The AI sees the current version and replies with only the changes.">
                  <textarea
                    autoFocus
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    rows={5}
                    placeholder="e.g. Make Theo less passive here — he should be the one who reaches first."
                    className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[14.5px] leading-relaxed outline-none focus:border-accent/60"
                  />
                </Field>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS[kind]?.map((s) => (
                    <button
                      key={s}
                      onClick={() => setInstruction((v) => (v.trim() ? `${v.trim()}\n${s}` : s))}
                      className="rounded-full border border-line bg-surface px-3 py-1 text-left text-[12.5px] text-muted transition-colors hover:border-line-strong hover:text-ink"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {kind === 'story' && (
                  <Switch
                    checked={includeOutline}
                    onChange={setIncludeOutline}
                    label="Include every beat and full character sheets"
                    hint="Needed for outline-wide edits. Makes the prompt much longer."
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* ── 2. Sent ── */}
        {step === 'sent' && prompt && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-ok/8 p-5 ring-1 ring-ok/20">
              <p className="flex items-center gap-2 font-medium text-ink">
                <Check size={16} className="text-ok" /> Prompt copied <span className="text-[12px] font-normal text-faint">~{estimateTokens(prompt.text).toLocaleString()} tokens</span>
              </p>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13.5px] text-muted">
                <li>Paste it into Grok (or any AI) and send.</li>
                <li>When it replies, copy the <strong className="text-ink">whole reply</strong>.</li>
                <li>Come back here and tap <strong className="text-ink">I have the reply</strong>.</li>
              </ol>
              <p className="mt-3 text-[12px] text-faint">If you leave the app, this request is remembered — use “Import AI reply” in the menu to pick up where you left off.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={GROK_URL} target="_blank" rel="noreferrer" className="inline-flex h-8.5 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium shadow-soft hover:bg-surface-2">
                <ExternalLink size={15} /> Open Grok
              </a>
              <Button
                variant="ghost"
                onClick={async () => {
                  await copyText(prompt.text)
                  toast('Copied again')
                }}
              >
                <Copy /> Copy again
              </Button>
            </div>
            <details className="rounded-xl border border-line">
              <summary className="cursor-pointer px-4 py-2.5 text-[12.5px] text-muted">Show the prompt</summary>
              <pre className="max-h-72 overflow-auto border-t border-line px-4 py-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-muted">{prompt.text}</pre>
            </details>
          </div>
        )}

        {/* ── 3. Paste ── */}
        {step === 'paste' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={pasteReply}>
                <ClipboardPaste /> Paste reply from clipboard
              </Button>
              {reply && (
                <Button variant="ghost" onClick={() => setReply('')}>
                  Clear
                </Button>
              )}
            </div>
            <Field label="…or paste it here">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={7}
                placeholder="Long-press → Paste the AI's whole reply. Trellis finds the JSON in it."
                className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[12.5px] leading-relaxed outline-none focus:border-accent/60 max-sm:text-[16px]"
              />
            </Field>
            <Field label="Apply to story" hint="Where chapters and story changes go. “None” creates a new story if the reply contains one.">
              <Select
                value={targetStoryId ?? ''}
                onChange={(v) => setTargetStoryId(v || null)}
                options={[{ value: '', label: 'None — new story / library only' }, ...(stories ?? []).map((s) => ({ value: s.id, label: s.title || 'Untitled story' }))]}
              />
            </Field>
            {error && <p className="rounded-xl bg-warn/10 px-4 py-3 text-[13px] text-ink ring-1 ring-warn/30">{error}</p>}
            {plan && (
              <p className="text-[13px] text-muted">
                Found <strong className="text-ink">{plan.changes.length}</strong> change{plan.changes.length === 1 ? '' : 's'}.
                {plan.changes.length === 0 && ' Everything in the reply already matches what you have.'}
              </p>
            )}
          </div>
        )}

        {/* ── 4. Review ── */}
        {step === 'review' && plan && (
          <ImportPreview plan={plan} warnings={[...parseWarnings, ...plan.warnings]} selected={selected} onToggle={(key) => setSelected((s) => {
            const next = new Set(s)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
          })} />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
        <div>
          {step === 'sent' && (
            <Button variant="ghost" onClick={() => setStep('ask')}>
              <ArrowLeft /> Edit request
            </Button>
          )}
          {step === 'paste' && kind !== 'import' && (
            <Button variant="ghost" onClick={() => setStep('sent')}>
              <ArrowLeft /> Back
            </Button>
          )}
          {step === 'review' && (
            <Button variant="ghost" onClick={() => setStep('paste')}>
              <ArrowLeft /> Back
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {step === 'ask' && (
            <Button variant="primary" disabled={!askReady} onClick={makePrompt}>
              <Sparkles /> Copy prompt for AI
            </Button>
          )}
          {step === 'sent' && (
            <Button variant="primary" onClick={() => setStep('paste')}>
              I have the reply <ArrowRight />
            </Button>
          )}
          {step === 'paste' && (
            <Button variant="primary" disabled={!plan || plan.changes.length === 0} onClick={() => setStep('review')}>
              Review changes <ArrowRight />
            </Button>
          )}
          {step === 'review' && plan && (
            <Button variant="primary" disabled={busy} onClick={apply}>
              <Check /> Apply {plan.changes.filter((c) => c.required || selected.has(c.key)).length} changes
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
}
