import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight, Check, Plus, RotateCcw, Sparkles, Wand2, X } from 'lucide-react'
import { useChapters, useCharacters, useStory } from '@/db/hooks'
import type { Story } from '@/db/types'
import { applyPlan, loadState } from '@/ai/apply'
import { restoreSnapshot } from '@/db/repo'
import { emptyOptions, mergeOptions, parseOptions, type Choice, type StoryOptions } from '@/ai/options'
import { buildAiRequest, DENSITIES, LENGTHS, type Picks, type Spark } from '@/ai/requests'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { Button, Field, Segmented } from '@/components/ui/primitives'
import { useConfirm, useToast } from '@/components/ui/overlays'
import { Screen, Scroll, TopBar } from '@/components/layout/Screen'
import { CharacterChips } from '@/features/characters/CharacterPicker'
import { ImportPreview } from '@/features/ai/ImportPreview'
import { SendStep } from '@/features/ai/SendStep'
import { useReplyPlan } from '@/features/ai/useReplyPlan'

/**
 * Guided new-story flow:
 *   Spark → (AI proposes options) → Choose → (AI builds the outline) → Review → Create
 * State is persisted locally, so switching to Grok on a phone (which may
 * reload this tab) never loses progress.
 */

type Step = 'spark' | 'send-options' | 'choose' | 'send-outline' | 'review'

interface PickState {
  directionId: string | null
  customDirection: string
  themeIds: string[]
  customThemes: string[]
  styleId: string | null
  customStyle: string
  elementIds: string[]
  customElements: string[]
  characterIds: string[]
  extra: string
}

interface BuilderState {
  step: Step
  spark: Spark
  options: StoryOptions | null
  picks: PickState
  prompt: string | null
  reply: string
}

/** New stories share one draft; outlining an existing story keeps a draft per story. */
const keyFor = (storyId?: string | null) => (storyId ? `trellis.builder:${storyId}` : 'trellis.builder')
const HEATS = ['', 'Sweet, fade to black', 'Steamy, some explicit scenes', 'Explicit, slow burn']

const fresh = (): BuilderState => ({
  step: 'spark',
  spark: { text: '', characterIds: [], heat: '', length: 'novella', density: 'rich' },
  options: null,
  picks: { directionId: null, customDirection: '', themeIds: [], customThemes: [], styleId: null, customStyle: '', elementIds: [], customElements: [], characterIds: [], extra: '' },
  prompt: null,
  reply: '',
})

function load(storyId: string | null): BuilderState | null {
  try {
    const raw = localStorage.getItem(keyFor(storyId))
    if (raw) return { ...fresh(), ...(JSON.parse(raw) as BuilderState) }
  } catch {
    /* ignore */
  }
  return null
}

/** Start outlining an existing story: its cast and heat are the starting point. */
const freshFor = (story: Story): BuilderState => {
  const s = fresh()
  return { ...s, spark: { ...s.spark, storyId: story.id, characterIds: story.cast.map((m) => m.characterId), heat: story.heat } }
}

const SPARK_EXAMPLES = [
  'Two rival chefs forced to share a kitchen in Lisbon for one summer.',
  'A married couple’s anniversary trip goes sideways when her ex is the hotel manager.',
  'A bodyguard and the heiress who keeps trying to lose him.',
]

const STEPS: { id: Step[]; label: string }[] = [
  { id: ['spark', 'send-options'], label: 'Spark' },
  { id: ['choose'], label: 'Choose' },
  { id: ['send-outline'], label: 'Outline' },
  { id: ['review'], label: 'Review' },
]

export function StoryBuilder() {
  const [params] = useSearchParams()
  const storyId = params.get('story')
  const story = useStory(storyId ?? undefined)
  const existingChapters = useChapters(storyId ?? undefined)
  const [st, setSt] = useState<BuilderState>(() => load(storyId) ?? fresh())
  // Story mode: once the story loads, seed from it (unless resuming a draft for it).
  useEffect(() => {
    if (story && st.spark.storyId !== story.id) setSt(load(story.id) ?? freshFor(story))
  }, [story, st.spark.storyId])
  const storyMode = !!storyId
  // Switching from story mode back to a brand-new story (same route, different query).
  useEffect(() => {
    if (!storyId && st.spark.storyId) setSt(load(null) ?? fresh())
  }, [storyId, st.spark.storyId])
  const characters = useCharacters()
  const charMap = useMemo(() => new Map((characters ?? []).map((c) => [c.id, c])), [characters])
  const navigate = useNavigate()
  const toast = useToast()
  const { confirm, element } = useConfirm()
  const [moreMode, setMoreMode] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      if (!storyMode || st.spark.storyId === storyId) localStorage.setItem(keyFor(st.spark.storyId), JSON.stringify(st))
    } catch {
      /* ignore */
    }
  }, [st])
  useEffect(() => {
    document.querySelector('[data-scroll]')?.scrollTo({ top: 0 })
  }, [st.step])

  const patch = (p: Partial<BuilderState>) => setSt((s) => ({ ...s, ...p }))
  const setSpark = (p: Partial<Spark>) => setSt((s) => ({ ...s, spark: { ...s.spark, ...p } }))
  const setPicks = (p: Partial<PickState>) => setSt((s) => ({ ...s, picks: { ...s.picks, ...p } }))

  /* ── Options reply ── */
  const parsedOptions = useMemo(() => (st.step === 'send-options' && st.reply.trim() ? parseOptions(st.reply) : null), [st.step, st.reply])

  /* ── Outline reply ── */
  const outline = useReplyPlan(st.step === 'send-outline' || st.step === 'review' ? st.reply : '', st.spark.storyId ?? null)

  const opts = st.options ?? emptyOptions()
  const picks: Picks = {
    direction: opts.directions.find((d) => d.id === st.picks.directionId) ?? null,
    customDirection: st.picks.customDirection,
    themes: [...opts.themes.filter((t) => st.picks.themeIds.includes(t.id)).map((t) => t.title), ...st.picks.customThemes],
    style: opts.styles.find((s) => s.id === st.picks.styleId) ?? null,
    customStyle: st.picks.customStyle,
    elements: [...opts.elements.filter((e) => st.picks.elementIds.includes(e.id)).map((e) => (e.description ? `${e.title} — ${e.description}` : e.title)), ...st.picks.customElements],
    characters: opts.characters.filter((c) => st.picks.characterIds.includes(c.id)).map((c) => c.character),
    extra: st.picks.extra,
  }
  const pickCount = (picks.direction ? 1 : 0) + picks.themes.length + (picks.style ? 1 : 0) + picks.elements.length + picks.characters.length

  const copy = async (kind: 'spark' | 'outline', skipPicks = false) => {
    const state = await loadState()
    const req =
      kind === 'spark'
        ? { kind: 'spark' as const, spark: st.spark, avoid: moreMode ? [...opts.directions, ...opts.styles, ...opts.characters].map((x) => x.title) : undefined }
        : { kind: 'outline' as const, spark: st.spark, picks: skipPicks ? null : picks }
    const { prompt } = buildAiRequest(req, state)
    await copyText(prompt)
    patch({ prompt, reply: '', step: kind === 'spark' ? 'send-options' : 'send-outline' })
  }

  const acceptOptions = () => {
    if (!parsedOptions?.options) return
    const merged = moreMode && st.options ? mergeOptions(st.options, parsedOptions.options) : parsedOptions.options
    setMoreMode(false)
    patch({ options: merged, step: 'choose', reply: '' })
  }

  const create = async () => {
    if (!outline.plan) return
    setBusy(true)
    try {
      const snapshotId = await applyPlan(outline.plan, outline.selected)
      const id = outline.plan.targetStoryId
      try {
        localStorage.removeItem(keyFor(st.spark.storyId))
      } catch {
        /* ignore */
      }
      toast(storyMode ? 'Outline added' : 'Story created', undefined, snapshotId ? { action: { label: 'Undo', run: () => restoreSnapshot(snapshotId) } } : undefined)
      if (id) navigate(`/stories/${id}`)
    } catch (e) {
      toast('Couldn’t create the story', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const stepIdx = STEPS.findIndex((s) => s.id.includes(st.step))
  const heading =
    st.step === 'spark' || st.step === 'send-options'
      ? storyMode
        ? story?.title || 'Untitled story'
        : 'What’s the spark?'
      : st.step === 'choose'
        ? 'Shape it'
        : st.step === 'send-outline'
          ? 'Build the outline'
          : 'Review'

  return (
    <Screen
      top={
        <TopBar
          left={
            <Button variant="ghost" size="icon" aria-label="Close" onClick={() => navigate(storyMode && story ? `/stories/${story.id}` : '/')}>
              <X />
            </Button>
          }
          title={
            <div className="min-w-0">
              <p className="text-[11.5px] font-semibold tracking-[0.08em] text-faint uppercase">
                {storyMode ? 'Outline with AI' : 'New story'} · {stepIdx + 1}/{STEPS.length}
              </p>
              <p className="truncate font-serif text-[18px] leading-tight">{heading}</p>
            </div>
          }
          right={
            (st.spark.text || st.options) && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Start over"
                onClick={async () => {
                  if (await confirm('Start over?', { body: 'Your spark, options and picks will be cleared.', action: 'Start over' })) setSt(story ? freshFor(story) : fresh())
                }}
              >
                <RotateCcw />
              </Button>
            )
          }
        />
      }
      sub={
        <div className="flex h-1 shrink-0 gap-0.5" aria-hidden>
          {STEPS.map((x, i) => (
            <span key={x.label} className={cn('flex-1', i <= stepIdx ? 'bg-accent' : 'bg-surface-2')} />
          ))}
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <Scroll className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-8">


      {/* ── Spark ── */}
      {st.step === 'spark' && (
        <div className="space-y-7">
          {storyMode && story && (
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
                            <p className="mt-1.5 font-serif text-[20px] leading-snug">{story.title || 'Untitled story'}</p>
              {story.logline && <p className="mt-1 text-[14px] text-muted">{story.logline}</p>}
              {story.premise && <p className="mt-2 line-clamp-4 text-[13.5px] leading-relaxed text-muted">{story.premise}</p>}
              <Link to={`/stories/${story.id}/bible`} className="mt-3 inline-block text-[13px] text-accent hover:underline">
                Edit story bible →
              </Link>
              {!!existingChapters?.length && (
                <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-[12.5px] text-ink ring-1 ring-warn/30">
                  This story already has {existingChapters.length} chapter{existingChapters.length === 1 ? '' : 's'}. New chapters are added after them — delete the old ones first if you want a clean slate.
                </p>
              )}
            </div>
          )}
          <div>
            {storyMode && <p className="mb-2 text-[13px] font-medium text-ink">Anything to steer it? (optional)</p>}
            <textarea
              autoFocus
              value={st.spark.text}
              onChange={(e) => setSpark({ text: e.target.value })}
              rows={storyMode ? 4 : 6}
              placeholder={
                storyMode
                  ? 'e.g. Start with them already married. Make the middle darker. End on an open question.'
                  : 'A situation, a pair of people, a scene you can’t stop thinking about…'
              }
              className="w-full resize-y rounded-2xl border border-line bg-surface px-5 py-4 font-serif text-[18px] leading-relaxed shadow-soft outline-none placeholder:text-faint focus:border-accent/50"
            />
            {!st.spark.text && !storyMode && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SPARK_EXAMPLES.map((e) => (
                  <button key={e} onClick={() => setSpark({ text: e })} className="rounded-full border border-line bg-surface px-3 py-1 text-left text-[12.5px] text-muted hover:border-line-strong hover:text-ink">
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Field label={storyMode ? 'Cast' : 'Characters from your library'}>
            <CharacterChips ids={st.spark.characterIds} characters={charMap} onChange={(characterIds) => setSpark({ characterIds })} placeholder="Pick characters" />
          </Field>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Heat">
              <select
                value={st.spark.heat}
                onChange={(e) => setSpark({ heat: e.target.value })}
                className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13.5px] outline-none max-sm:text-[16px]"
              >
                {HEATS.map((h) => (
                  <option key={h} value={h}>
                    {h || 'Let the AI suggest'}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Length" hint={`${LENGTHS[st.spark.length].chapters} chapters`}>
              <Segmented size="sm" value={st.spark.length} onChange={(length) => setSpark({ length })} options={(Object.keys(LENGTHS) as Spark['length'][]).map((k) => ({ value: k, label: LENGTHS[k].label }))} />
            </Field>
            <Field label="Beats per chapter" hint={`${DENSITIES[st.spark.density].beats} beats`}>
              <Segmented size="sm" value={st.spark.density} onChange={(density) => setSpark({ density })} options={(Object.keys(DENSITIES) as Spark['density'][]).map((k) => ({ value: k, label: DENSITIES[k].label }))} />
            </Field>
          </div>
        </div>
      )}

      {/* ── Send (options or outline) ── */}
      {(st.step === 'send-options' || st.step === 'send-outline') && (
        <div className="space-y-4">

          <SendStep
            prompt={st.prompt}
            reply={st.reply}
            onReply={(reply) => patch({ reply })}
            error={st.step === 'send-options' ? parsedOptions?.error : outline.error}
            status={
              st.step === 'send-options'
                ? parsedOptions?.options && (
                    <>
                      Got {parsedOptions.options.directions.length} directions, {parsedOptions.options.themes.length} themes, {parsedOptions.options.styles.length} styles, {parsedOptions.options.elements.length} elements, {parsedOptions.options.characters.length} characters.
                    </>
                  )
                : outline.plan && (
                    <>
                      Got {outline.plan.changes.filter((c) => c.group === 'chapter').length} chapters and {outline.plan.changes.reduce((n, c) => n + (c.beats?.length ?? 0), 0)} beats.
                    </>
                  )
            }
          />
        </div>
      )}

      {/* ── Choose ── */}
      {st.step === 'choose' && (
        <div className="space-y-10">
          <Section n={1} title={storyMode ? 'How it unfolds' : 'Direction'}>
            <div className="grid gap-3">
              {opts.directions.map((d) => (
                <OptionCard key={d.id} on={st.picks.directionId === d.id} onClick={() => setPicks({ directionId: st.picks.directionId === d.id ? null : d.id })} radio>
                  <p className="font-serif text-[17px] leading-snug text-ink">{d.title}</p>
                  {d.logline && <p className="mt-1 text-[13.5px] font-medium text-muted">{d.logline}</p>}
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{d.description || d.premise}</p>
                  {(d.genre || d.heat) && <p className="mt-2 text-[11.5px] text-faint">{[d.genre, d.heat].filter(Boolean).join(' · ')}</p>}
                </OptionCard>
              ))}
            </div>
            <textarea
              value={st.picks.customDirection}
              onChange={(e) => setPicks({ customDirection: e.target.value })}
              rows={2}
              placeholder="Your own take, or a mix: “The second one, but with the ending of the fourth.”"
              className="mt-3 w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent/60"
            />
          </Section>

          <Section n={2} title="Themes">
            <ChipSet items={opts.themes} selected={st.picks.themeIds} onChange={(themeIds) => setPicks({ themeIds })} custom={st.picks.customThemes} onCustom={(customThemes) => setPicks({ customThemes })} placeholder="Add your own theme" />
          </Section>

          <Section n={3} title="Prose style">
            <div className="grid gap-3">
              {opts.styles.map((s) => (
                <OptionCard key={s.id} on={st.picks.styleId === s.id} onClick={() => setPicks({ styleId: st.picks.styleId === s.id ? null : s.id })} radio>
                  <p className="font-medium text-ink">{s.title}</p>
                  <p className="mt-0.5 text-[13px] text-muted">{s.description}</p>
                  {s.sample && <blockquote className="mt-3 border-l-2 border-accent/30 pl-3 font-serif text-[15px] leading-relaxed text-ink/85 italic">{s.sample}</blockquote>}
                  {(s.pov || s.tense) && <p className="mt-2 text-[11.5px] text-faint">{[s.pov, s.tense && `${s.tense} tense`].filter(Boolean).join(' · ')}</p>}
                </OptionCard>
              ))}
            </div>
            <input
              value={st.picks.customStyle}
              onChange={(e) => setPicks({ customStyle: e.target.value })}
              placeholder="Style notes of your own (optional)"
              className="mt-3 h-10 w-full rounded-xl border border-line bg-surface px-3 text-[14px] outline-none focus:border-accent/60"
            />
          </Section>

          <Section n={4} title="Story elements">
            <div className="grid gap-2 sm:grid-cols-2">
              {opts.elements.map((e) => {
                const on = st.picks.elementIds.includes(e.id)
                return (
                  <OptionCard key={e.id} on={on} compact onClick={() => setPicks({ elementIds: on ? st.picks.elementIds.filter((x) => x !== e.id) : [...st.picks.elementIds, e.id] })}>
                    <p className="text-[14px] font-medium text-ink">{e.title}</p>
                    {e.description && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{e.description}</p>}
                  </OptionCard>
                )
              })}
            </div>
            <CustomList items={st.picks.customElements} onChange={(customElements) => setPicks({ customElements })} placeholder="Add a moment you want in the story" />
          </Section>

          {(opts.characters.length > 0 || st.spark.characterIds.length > 0) && (
            <Section n={5} title="Characters">
              <div className="grid gap-2 sm:grid-cols-2">
                {st.spark.characterIds.map((id) => {
                  const c = charMap.get(id)
                  return c ? (
                    <div key={id} className="rounded-xl border border-line bg-surface-2/50 px-4 py-3">
                      <p className="text-[14px] font-medium">{c.name}</p>
                      <p className="text-[12px] text-faint">Included</p>
                    </div>
                  ) : null
                })}
                {opts.characters.map((c) => {
                  const on = st.picks.characterIds.includes(c.id)
                  return (
                    <OptionCard key={c.id} on={on} compact onClick={() => setPicks({ characterIds: on ? st.picks.characterIds.filter((x) => x !== c.id) : [...st.picks.characterIds, c.id] })}>
                      <p className="text-[14px] font-medium text-ink">
                        {c.title}
                        {c.character.role && <span className="ml-1.5 text-[12px] font-normal text-faint">{c.character.role}</span>}
                      </p>
                      <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{c.description}</p>
                    </OptionCard>
                  )
                })}
              </div>
            </Section>
          )}

          <Section n={opts.characters.length || st.spark.characterIds.length ? 6 : 5} title="Anything else?">
            <textarea
              value={st.picks.extra}
              onChange={(e) => setPicks({ extra: e.target.value })}
              rows={3}
              placeholder="How it should end, things to avoid, a scene you already see clearly…"
              className="w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent/60"
            />
            <div className="mt-4 flex flex-wrap gap-5">
              <Field label="Length">
                <Segmented size="sm" value={st.spark.length} onChange={(length) => setSpark({ length })} options={(Object.keys(LENGTHS) as Spark['length'][]).map((k) => ({ value: k, label: LENGTHS[k].label }))} />
              </Field>
              <Field label="Beats per chapter">
                <Segmented size="sm" value={st.spark.density} onChange={(density) => setSpark({ density })} options={(Object.keys(DENSITIES) as Spark['density'][]).map((k) => ({ value: k, label: DENSITIES[k].label }))} />
              </Field>
            </div>
          </Section>
        </div>
      )}

      {/* ── Review ── */}
      {st.step === 'review' && outline.plan && (
        <ImportPreview plan={outline.plan} warnings={outline.warnings} selected={outline.selected} onChange={outline.setSelected} />
      )}

          </div>
        </Scroll>
      {/* ── Sticky footer ── */}
      <div className="shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom,0px)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3 sm:px-8">
          <div>
            {st.step === 'send-options' && (
              <Button variant="ghost" onClick={() => patch({ step: st.options ? 'choose' : 'spark' })}>
                <ArrowLeft /> Back
              </Button>
            )}
            {st.step === 'choose' && (
              <Button
                variant="ghost"
                onClick={async () => {
                  setMoreMode(true)
                  await copy('spark')
                }}
              >
                <Plus /> More options
              </Button>
            )}
            {st.step === 'send-outline' && (
              <Button variant="ghost" onClick={() => patch({ step: st.options ? 'choose' : 'spark' })}>
                <ArrowLeft /> Back
              </Button>
            )}
            {st.step === 'review' && (
              <Button variant="ghost" onClick={() => patch({ step: 'send-outline' })}>
                <ArrowLeft /> Back
              </Button>
            )}
            {st.step === 'spark' && (st.spark.text.trim() || storyMode) && (
              <Button variant="ghost" onClick={() => copy('outline', true)} title="Skip the options and get an outline straight away">
                Skip to outline
              </Button>
            )}
          </div>
          <div>
            {st.step === 'spark' && (
              <Button variant="primary" disabled={!st.spark.text.trim() && !storyMode} onClick={() => copy('spark')}>
                <Sparkles /> Get options
              </Button>
            )}
            {st.step === 'send-options' && (
              <Button variant="primary" disabled={!parsedOptions?.options} onClick={acceptOptions}>
                See options <ArrowRight />
              </Button>
            )}
            {st.step === 'choose' && (
              <Button variant="primary" onClick={() => copy('outline')}>
                <Wand2 /> Build outline{pickCount ? ` · ${pickCount} picks` : ''}
              </Button>
            )}
            {st.step === 'send-outline' && (
              <Button variant="primary" disabled={!outline.plan || !outline.plan.changes.length} onClick={() => patch({ step: 'review' })}>
                Review <ArrowRight />
              </Button>
            )}
            {st.step === 'review' && (
              <Button variant="primary" disabled={busy} onClick={create}>
                <Check /> {storyMode ? 'Add to story' : 'Create story'}
              </Button>
            )}
          </div>
        </div>
      </div>
      </div>
      {element}
    </Screen>
  )
}

/* ───────────────────────────── Pieces ───────────────────────────── */

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-serif text-[15px] text-faint">{n}</span>
        <div>
          <h2 className="font-serif text-[21px] leading-tight">{title}</h2>
          {hint && <p className="text-[12.5px] text-faint">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function OptionCard({ on, onClick, children, radio, compact }: { on: boolean; onClick: () => void; children: ReactNode; radio?: boolean; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'relative w-full rounded-2xl border text-left transition-all duration-150',
        compact ? 'px-4 py-3' : 'px-5 py-4',
        on ? 'border-accent/60 bg-accent-soft/40 shadow-soft ring-3 ring-accent/10' : 'border-line bg-surface hover:border-line-strong',
      )}
    >
      <span
        className={cn(
          'absolute top-3 right-3 flex h-5 w-5 items-center justify-center border transition-colors',
          radio ? 'rounded-full' : 'rounded-md',
          on ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong bg-surface',
        )}
      >
        {on && <Check size={12} strokeWidth={3} />}
      </span>
      <div className="pr-7">{children}</div>
    </button>
  )
}

function ChipSet({
  items,
  selected,
  onChange,
  custom,
  onCustom,
  placeholder,
}: {
  items: Choice[]
  selected: string[]
  onChange: (ids: string[]) => void
  custom: string[]
  onCustom: (v: string[]) => void
  placeholder: string
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const t = draft.trim()
    if (t && !custom.includes(t)) onCustom([...custom, t])
    setDraft('')
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t) => {
        const on = selected.includes(t.id)
        return (
          <button
            key={t.id}
            title={t.description}
            onClick={() => onChange(on ? selected.filter((x) => x !== t.id) : [...selected, t.id])}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[13.5px] transition-colors',
              on ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
            )}
          >
            {t.title}
          </button>
        )
      })}
      {custom.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent px-3.5 py-1.5 text-[13.5px] text-accent-ink">
          {t}
          <button onClick={() => onCustom(custom.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="opacity-70 hover:opacity-100">
            <X size={13} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
        onBlur={add}
        placeholder={`+ ${placeholder}`}
        className="h-9 min-w-40 flex-1 rounded-full border border-dashed border-line-strong bg-transparent px-3.5 text-[13.5px] outline-none focus:border-accent/60"
      />
    </div>
  )
}

function CustomList({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const t = draft.trim()
    if (t) onChange([...items, t])
    setDraft('')
  }
  return (
    <div className="mt-3 space-y-2">
      {items.map((t, i) => (
        <div key={i} className="flex items-start gap-2 rounded-xl border border-accent/50 bg-accent-soft/40 px-4 py-2.5 text-[14px]">
          <Check size={14} className="mt-1 shrink-0 text-accent" />
          <span className="flex-1">{t}</span>
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove" className="text-faint hover:text-ink">
            <X size={14} />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="h-10 flex-1 rounded-xl border border-dashed border-line-strong bg-transparent px-3 text-[14px] outline-none focus:border-accent/60"
        />
        <Button onClick={add} disabled={!draft.trim()}>
          <Plus /> Add
        </Button>
      </div>
    </div>
  )
}
