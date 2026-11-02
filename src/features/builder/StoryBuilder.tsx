import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, Check, Plus, RotateCcw, Sparkles, Wand2, X } from 'lucide-react'
import { useCharacters } from '@/db/hooks'
import { applyPlan, loadState } from '@/ai/apply'
import { emptyOptions, mergeOptions, parseOptions, type Choice, type StoryOptions } from '@/ai/options'
import { buildAiRequest, DENSITIES, LENGTHS, type Picks, type Spark } from '@/ai/requests'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { Button, Field, Segmented } from '@/components/ui/primitives'
import { useConfirm, useToast } from '@/components/ui/overlays'
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

const KEY = 'trellis.builder'
const HEATS = ['', 'Sweet, fade to black', 'Steamy, some explicit scenes', 'Explicit, slow burn']

const fresh = (): BuilderState => ({
  step: 'spark',
  spark: { text: '', characterIds: [], heat: '', length: 'novella', density: 'rich' },
  options: null,
  picks: { directionId: null, customDirection: '', themeIds: [], customThemes: [], styleId: null, customStyle: '', elementIds: [], customElements: [], characterIds: [], extra: '' },
  prompt: null,
  reply: '',
})

function load(): BuilderState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...fresh(), ...(JSON.parse(raw) as BuilderState) }
  } catch {
    /* ignore */
  }
  return fresh()
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
  const [st, setSt] = useState<BuilderState>(load)
  const characters = useCharacters()
  const charMap = useMemo(() => new Map((characters ?? []).map((c) => [c.id, c])), [characters])
  const navigate = useNavigate()
  const toast = useToast()
  const { confirm, element } = useConfirm()
  const [moreMode, setMoreMode] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(st))
    } catch {
      /* ignore */
    }
  }, [st])
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 })
  }, [st.step])

  const patch = (p: Partial<BuilderState>) => setSt((s) => ({ ...s, ...p }))
  const setSpark = (p: Partial<Spark>) => setSt((s) => ({ ...s, spark: { ...s.spark, ...p } }))
  const setPicks = (p: Partial<PickState>) => setSt((s) => ({ ...s, picks: { ...s.picks, ...p } }))

  /* ── Options reply ── */
  const parsedOptions = useMemo(() => (st.step === 'send-options' && st.reply.trim() ? parseOptions(st.reply) : null), [st.step, st.reply])

  /* ── Outline reply ── */
  const outline = useReplyPlan(st.step === 'send-outline' || st.step === 'review' ? st.reply : '', null)

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
      await applyPlan(outline.plan, outline.selected)
      const id = outline.plan.targetStoryId
      localStorage.removeItem(KEY)
      toast('Story created', 'Start writing from any chapter’s Write tab')
      if (id) navigate(`/stories/${id}`)
    } catch (e) {
      toast('Couldn’t create the story', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const stepIdx = STEPS.findIndex((s) => s.id.includes(st.step))

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-32 sm:px-8 lg:pt-10">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.08em] text-faint uppercase">
            <Wand2 size={13} /> Story builder
          </div>
          <h1 className="font-serif text-[30px] leading-tight tracking-tight">
            {st.step === 'spark' || st.step === 'send-options' ? 'What’s the spark?' : st.step === 'choose' ? 'Shape it' : st.step === 'send-outline' ? 'Build the outline' : 'Your story'}
          </h1>
        </div>
        {st !== null && (st.spark.text || st.options) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (await confirm('Start over?', { body: 'Your spark, options and picks will be cleared.', action: 'Start over' })) setSt(fresh())
            }}
          >
            <RotateCcw /> Start over
          </Button>
        )}
      </div>
      <ol className="mb-8 flex items-center gap-2 text-[12px]">
        {STEPS.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-5.5 w-5.5 items-center justify-center rounded-full text-[11px] font-semibold',
                i < stepIdx ? 'bg-ok text-white' : i === stepIdx ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-faint',
              )}
            >
              {i < stepIdx ? <Check size={11} strokeWidth={3} /> : i + 1}
            </span>
            <span className={i === stepIdx ? 'font-medium text-ink' : 'text-faint max-sm:hidden'}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="h-px w-5 bg-line-strong" />}
          </li>
        ))}
      </ol>

      {/* ── Spark ── */}
      {st.step === 'spark' && (
        <div className="space-y-7">
          <div>
            <textarea
              autoFocus
              value={st.spark.text}
              onChange={(e) => setSpark({ text: e.target.value })}
              rows={6}
              placeholder="A sentence or a page — a situation, a pair of people, a feeling, a scene you can’t stop thinking about. It doesn’t need to be figured out."
              className="w-full resize-y rounded-2xl border border-line bg-surface px-5 py-4 font-serif text-[18px] leading-relaxed shadow-soft outline-none placeholder:text-faint focus:border-accent/50"
            />
            {!st.spark.text && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SPARK_EXAMPLES.map((e) => (
                  <button key={e} onClick={() => setSpark({ text: e })} className="rounded-full border border-line bg-surface px-3 py-1 text-left text-[12.5px] text-muted hover:border-line-strong hover:text-ink">
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Field label="Bring characters from your library (optional)">
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
          <p className="text-[14px] text-muted">
            {st.step === 'send-options'
              ? moreMode
                ? 'Asking for fresh alternatives. New options are added to the ones you already have.'
                : 'Grok will reply with options — directions, themes, prose styles, story elements and characters — for you to pick from.'
              : 'Grok will build the full plan from your picks: story bible, characters, relationships, chapters and beats — with a few optional beats per chapter for you to opt into.'}
          </p>
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
          <Section n={1} title="Direction" hint="Pick one, or describe a mix in your own words.">
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

          <Section n={2} title="Themes" hint="Tap all that resonate.">
            <ChipSet items={opts.themes} selected={st.picks.themeIds} onChange={(themeIds) => setPicks({ themeIds })} custom={st.picks.customThemes} onCustom={(customThemes) => setPicks({ customThemes })} placeholder="Add your own theme" />
          </Section>

          <Section n={3} title="Prose style" hint="Read the samples — pick the one that sounds like your book.">
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

          <Section n={4} title="Story elements" hint="Moments, tropes and set pieces. The AI will place each one where it fits.">
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
            <Section n={5} title="Characters" hint="Pick who’s in it. Your library characters are always included.">
              <div className="grid gap-2 sm:grid-cols-2">
                {st.spark.characterIds.map((id) => {
                  const c = charMap.get(id)
                  return c ? (
                    <div key={id} className="rounded-xl border border-line bg-surface-2/50 px-4 py-3">
                      <p className="text-[14px] font-medium">{c.name}</p>
                      <p className="text-[12px] text-faint">From your library · included</p>
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

      {/* ── Sticky footer ── */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 backdrop-blur lg:left-[260px]">
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
            {st.step === 'spark' && st.spark.text.trim() && (
              <Button variant="ghost" onClick={() => copy('outline', true)} title="Skip the options and get an outline straight away">
                Skip to outline
              </Button>
            )}
          </div>
          <div>
            {st.step === 'spark' && (
              <Button variant="primary" disabled={!st.spark.text.trim()} onClick={() => copy('spark')}>
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
                <Check /> Create story
              </Button>
            )}
          </div>
        </div>
      </div>
      {element}
    </div>
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
