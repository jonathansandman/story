import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, Check, Lightbulb, RefreshCw, Sparkles, Wand2, X } from 'lucide-react'
import { useCharacters, useStories } from '@/db/hooks'
import { db } from '@/db/db'
import { addIdea, removeIdeas, restoreSnapshot } from '@/db/repo'
import { applyPlan, loadState } from '@/ai/apply'
import { changeIdeasFor } from '@/ai/changes'
import { buildAiRequest, type AiRequest } from '@/ai/requests'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { Button, Field, Select, Switch, Tick } from '@/components/ui/primitives'
import { Dialog, useToast } from '@/components/ui/overlays'
import { clearPending, loadPending, savePending } from './ai-context'
import { ImportPreview } from './ImportPreview'
import { SendStep } from './SendStep'
import { useReplyPlan } from './useReplyPlan'

export type AiDialogStart =
  | { kind: 'import' }
  | { kind: 'new-character'; storyId?: string | null }
  | { kind: 'story'; storyId: string }
  | { kind: 'character'; characterId: string }
  | { kind: 'chapter'; chapterId: string; instruction?: string }
  | { kind: 'beat'; beatId: string }
  | { kind: 'brainstorm'; chapterId: string }
  | { kind: 'weave'; storyId: string }

type Step = 'ask' | 'send' | 'review'

const SUGGESTIONS: Record<string, string[]> = {
  story: [
    'Write a vivid style guide for the prose.',
    'Sharpen the logline and premise.',
    'Suggest the themes this story should explore.',
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
  brainstorm: ['More tension and complications.', 'More intimate, slow-burn moments.', 'Surprising reversals.', 'Quiet character beats that reveal backstory.'],
}

export function AiDialog({ start, onClose }: { start: AiDialogStart; onClose: () => void }) {
  const stories = useStories()
  const characters = useCharacters()
  const charMap = useMemo(() => new Map((characters ?? []).map((c) => [c.id, c])), [characters])
  const toast = useToast()
  const navigate = useNavigate()
  const kind = start.kind

  const [step, setStep] = useState<Step>(kind === 'import' ? 'send' : 'ask')
  const [instruction, setInstruction] = useState(start.kind === 'chapter' ? (start.instruction ?? '') : '')
  const [includeOutline, setIncludeOutline] = useState(false)
  const [prompt, setPrompt] = useState<string | null>(null)
  const [targetStoryId, setTargetStoryId] = useState<string | null>(() => (kind === 'import' ? (loadPending()?.targetStoryId ?? null) : null))
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  // Weave: which inbox ideas to include.
  const weaveStory = start.kind === 'weave' ? stories?.find((s) => s.id === start.storyId) : undefined
  const [ideaIds, setIdeaIds] = useState<string[] | null>(null)
  const ideas = weaveStory?.ideas ?? []
  const chosenIdeas = ideaIds ? ideas.filter((i) => ideaIds.includes(i.id)) : ideas

  const { plan, error, warnings, selected, setSelected } = useReplyPlan(reply, targetStoryId)

  const askReady = kind === 'brainstorm' ? true : kind === 'weave' ? chosenIdeas.length > 0 || instruction.trim().length > 0 : instruction.trim().length > 0

  const toRequest = (): AiRequest | null => {
    switch (start.kind) {
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
      case 'brainstorm':
        return { kind: 'brainstorm', chapterId: start.chapterId, focus: instruction }
      case 'weave':
        return { kind: 'weave', storyId: start.storyId, ideas: chosenIdeas, extra: instruction }
      default:
        return null
    }
  }

  const makePrompt = async () => {
    const req = toRequest()
    if (!req) return
    const built = buildAiRequest(req, await loadState())
    await copyText(built.prompt)
    setPrompt(built.prompt)
    setTargetStoryId(built.targetStoryId)
    savePending({ title: built.title, targetStoryId: built.targetStoryId, at: Date.now(), ...(start.kind === 'weave' ? { ideaIds: chosenIdeas.map((i) => i.id) } : {}) })
    setStep('send')
  }

  const apply = async () => {
    if (!plan) return
    setBusy(true)
    try {
      const pending = loadPending()
      const snapshotId = await applyPlan(plan, selected)
      clearPending()
      // Woven ideas leave the inbox — whether applied here or after returning via “Paste reply”.
      if (start.kind === 'weave') await removeIdeas(start.storyId, chosenIdeas.map((i) => i.id))
      else if (start.kind === 'import' && pending?.ideaIds?.length && pending.targetStoryId) await removeIdeas(pending.targetStoryId, pending.ideaIds)
      // Story/character edits: queue a "[CHANGE]" idea so the outline can follow in one tap.
      let queued = 0
      if (start.kind === 'story' || start.kind === 'character' || start.kind === 'import') {
        const withBeats = new Set((await db.beats.toArray()).map((b) => b.storyId))
        for (const c of changeIdeasFor(plan, selected, await db.stories.toArray(), withBeats)) {
          await addIdea(c.storyId, c.text, 'change')
          queued++
        }
      }
      const n = plan.changes.filter((c) => c.required || selected.has(c.key)).length
      toast('Applied', queued ? 'Outline update added to Ideas' : `${n} change${n === 1 ? '' : 's'}`, snapshotId ? { action: { label: 'Undo', run: () => restoreSnapshot(snapshotId) } } : undefined)
      onClose()
      const firstChapter = plan.changes.find((c) => c.group === 'chapter' && selected.has(c.key))
      const chars = plan.changes.filter((c) => c.group === 'character' && selected.has(c.key))
      if (plan.targetStoryId && (plan.storyIsNew || firstChapter || queued || plan.changes.some((c) => c.group === 'story')))
        navigate(`/stories/${plan.targetStoryId}${firstChapter ? `?chapter=${firstChapter.row.id}` : ''}`)
      else if (chars.length === 1 && start.kind !== 'character') navigate(`/characters/${chars[0]!.row.id}`)
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
      : kind === 'new-character'
        ? 'Create a character with AI'
        : kind === 'brainstorm'
          ? 'Brainstorm beats'
          : kind === 'weave'
            ? 'Weave ideas into the story'
            : `Edit ${subject} with AI`

  const steps: { id: Step; label: string }[] = [
    ...(kind === 'import' ? [] : [{ id: 'ask' as Step, label: 'Ask' }]),
    { id: 'send', label: kind === 'import' ? 'Paste' : 'Send & paste' },
    { id: 'review', label: kind === 'brainstorm' ? 'Pick' : 'Review' },
  ]
  const stepIndex = steps.findIndex((s) => s.id === step)
  const chosenCount = plan ? plan.changes.filter((c) => c.required || selected.has(c.key)).length + plan.changes.reduce((n, c) => n + (c.beats ?? []).filter((b) => selected.has(b.key) && b.op === 'create').length, 0) : 0

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={heading}
      hideHeader
      className="h-[min(90vh,880px)] max-w-2xl overflow-hidden max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0"
    >
      {/* Header */}
      <div className="border-b border-line px-5 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="-ml-2">
            <X />
          </Button>
          <h2 className="flex min-w-0 flex-1 items-center gap-2 font-serif text-[19px]">
            {kind === 'weave' ? <Lightbulb size={17} className="shrink-0 text-accent" /> : <Wand2 size={17} className="shrink-0 text-accent" />}
            <span className="truncate">{heading}</span>
          </h2>
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
        {step === 'ask' && (
          <div className="space-y-5">
            {kind === 'weave' && (
              <>
                {ideas.length > 0 ? (
                  <ul className="space-y-1.5">
                    {ideas.map((i) => {
                      const on = chosenIdeas.includes(i)
                      return (
                        <li key={i.id}>
                          <button
                            onClick={() => setIdeaIds((cur) => {
                              const base = cur ?? ideas.map((x) => x.id)
                              return base.includes(i.id) ? base.filter((x) => x !== i.id) : [...base, i.id]
                            })}
                            className={cn('flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors', on ? 'border-accent/40 bg-accent-soft/40' : 'border-line bg-surface opacity-60')}
                          >
                            <Tick on={on} />
                            <span className="text-[13.5px] leading-snug">
                              {i.kind === 'change' && <span className="mr-1.5 rounded bg-warn/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-warn uppercase">Change</span>}
                              {i.text}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  null
                )}
                <Field label={ideas.length ? 'Anything else?' : 'Your idea'}>
                  <textarea
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    rows={3}
                    placeholder="e.g. June should catch them on the causeway."
                    className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[14.5px] leading-relaxed outline-none focus:border-accent/60"
                  />
                </Field>
              </>
            )}

            {kind === 'brainstorm' && (
              <>
                <Field label="Direction">
                  <textarea
                    autoFocus
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    rows={3}
                    placeholder="e.g. more tension between Mara and June; a moment of real tenderness."
                    className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[14.5px] leading-relaxed outline-none focus:border-accent/60"
                  />
                </Field>
              </>
            )}

            {kind === 'new-character' && (
              <Field label="Who is this person?">
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
                <Field label="What should change?">
                  <textarea
                    autoFocus
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    rows={5}
                    placeholder="e.g. Make Theo less passive here — he should be the one who reaches first."
                    className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[14.5px] leading-relaxed outline-none focus:border-accent/60"
                  />
                </Field>
                {kind === 'story' && (
                  <Switch
                    checked={includeOutline}
                    onChange={setIncludeOutline}
                    label="Include every beat and full character sheets"
                  />
                )}
              </>
            )}

            {SUGGESTIONS[kind] && (
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS[kind]!.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInstruction((v) => (v.trim() ? `${v.trim()}\n${s}` : s))}
                    className="rounded-full border border-line bg-surface px-3 py-1 text-left text-[12.5px] text-muted transition-colors hover:border-line-strong hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'send' && (
          <div className="space-y-5">
            <SendStep
              prompt={prompt}
              reply={reply}
              onReply={setReply}
              error={error}
              status={plan && (plan.changes.length ? <>Found <strong className="text-ink">{plan.changes.length}</strong> item{plan.changes.length === 1 ? '' : 's'} to review.</> : 'Everything in the reply already matches what you have.')}
            />
            {kind === 'import' && (
              <Field label="Apply to story">
                <Select
                  value={targetStoryId ?? ''}
                  onChange={(v) => setTargetStoryId(v || null)}
                  options={[{ value: '', label: 'None — new story / library only' }, ...(stories ?? []).map((s) => ({ value: s.id, label: s.title || 'Untitled story' }))]}
                />
              </Field>
            )}
          </div>
        )}

        {step === 'review' && plan && <ImportPreview plan={plan} warnings={warnings} selected={selected} onChange={setSelected} />}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
        <div>
          {step === 'send' && kind !== 'import' && (
            <Button variant="ghost" onClick={() => setStep('ask')}>
              <ArrowLeft /> Edit request
            </Button>
          )}
          {step === 'review' && (
            <Button variant="ghost" onClick={() => setStep('send')}>
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
          {step === 'send' && (
            <>
              {prompt && !reply && (
                <Button variant="ghost" onClick={makePrompt} title="Rebuild and copy the prompt">
                  <RefreshCw />
                </Button>
              )}
              <Button variant="primary" disabled={!plan || plan.changes.length === 0} onClick={() => setStep('review')}>
                {kind === 'brainstorm' ? 'Pick beats' : 'Review'} <ArrowRight />
              </Button>
            </>
          )}
          {step === 'review' && plan && (
            <Button variant="primary" disabled={busy || chosenCount === 0} onClick={apply}>
              <Check /> Apply
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
}
