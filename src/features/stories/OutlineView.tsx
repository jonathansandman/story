import { useEffect, useMemo, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router'
import { ChevronDown, Copy, GripVertical, Lightbulb, MoreHorizontal, Plus, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { useAi } from '@/features/ai/ai-context'
import { useChapters, useCharacters, useStoryBeats, useStoryProse } from '@/db/hooks'
import { createBeat, createChapter, deleteChapter, reorder, updateChapter } from '@/db/repo'
import type { Beat, Chapter, Character, Draft } from '@/db/types'
import { cn } from '@/lib/cn'
import { plural, wordCount } from '@/lib/text'
import { Button, Field, Segmented, TextArea, TextInput } from '@/components/ui/primitives'
import { Menu, MenuContent, MenuItem, MenuTrigger, useConfirm } from '@/components/ui/overlays'
import { SortableItem, SortableList, useOptimisticOrder } from '@/components/ui/Sortable'
import { CharacterChips, CharacterPicker } from '@/features/characters/CharacterPicker'
import { useComposer } from '@/features/export/composer-context'
import { ReadingView } from './ReadingView'
import { WriteView } from './WriteView'
import { IdeasBar } from './IdeasBar'
import { BeatCard } from './BeatCard'
import { BEAT_STATUS, BEAT_STATUSES } from './status'
import type { StoryOutletContext } from './StoryLayout'

/**
 * The outline: chapters on the left, the selected chapter's beats on the
 * right. Selection (for "copy selected beats") persists across chapters so a
 * custom prompt can span them.
 */
export function OutlineView() {
  const { story } = useOutletContext<StoryOutletContext>()
  const chapters = useChapters(story.id)
  const beats = useStoryBeats(story.id)
  const characters = useCharacters()
  const prose = useStoryProse(story.id)
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<string[]>([])
  const { quickCopy, openComposer } = useComposer()

  const charMap = useMemo(() => new Map((characters ?? []).map((c) => [c.id, c])), [characters])
  const castIds = story.cast.map((m) => m.characterId)

  const chapterId = params.get('chapter') ?? chapters?.[0]?.id
  const chapter = chapters?.find((c) => c.id === chapterId) ?? chapters?.[0]
  const beatParam = params.get('beat')

  const selectChapter = (id: string) => setParams({ chapter: id }, { replace: true })

  if (!chapters || !beats || !prose) return null

  // Selection is shown in story order regardless of click order.
  const orderedSelection = chapters.flatMap((c) => (beats.get(c.id) ?? []).filter((b) => selected.includes(b.id)).map((b) => b.id))

  return (
    <>
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-6 sm:px-8 lg:pt-8">
      <IdeasBar story={story} />
    </div>
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 px-4 py-6 sm:px-8 lg:flex-row lg:gap-10 lg:py-8">
      <ChapterRail chapters={chapters} beats={beats} activeId={chapter?.id} onSelect={selectChapter} storyId={story.id} />

      <div className="min-w-0 flex-1 pb-28">
        {chapter ? (
          <ChapterPanel
            key={chapter.id}
            chapter={chapter}
            index={chapters.indexOf(chapter)}
            chapters={chapters}
            beats={beats.get(chapter.id) ?? []}
            prose={prose}
            characters={charMap}
            castIds={castIds}
            initialBeat={beatParam}
            selected={selected}
            setSelected={setSelected}
            onDeleted={() => setParams({}, { replace: true })}
          />
        ) : (
          <div className="py-20 text-center">
            <Button variant="primary" onClick={async () => selectChapter((await createChapter(story.id, { title: 'Chapter one' })).id)}>
              <Plus /> Add the first chapter
            </Button>
          </div>
        )}
      </div>

      {orderedSelection.length > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-line bg-surface py-2 pr-2 pl-4 shadow-lift animate-rise">
            <span className="text-[13px] text-ink">
              <strong className="font-semibold">{orderedSelection.length}</strong> beat{orderedSelection.length === 1 ? '' : 's'} selected
            </span>
            <span className="mx-1 h-5 w-px bg-line" />
            <Button variant="primary" size="sm" onClick={() => quickCopy(story.id, { kind: 'selection', beatIds: orderedSelection })}>
              <Copy /> Copy as prompt
            </Button>
            <Button size="sm" onClick={() => openComposer(story.id, { kind: 'selection', beatIds: orderedSelection })}>
              <Sparkles /> Compose…
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setSelected([])} aria-label="Clear selection">
              <X />
            </Button>
          </div>
        </div>
      )}
    </div>
    </>
  )
}

/* ───────────────────────────── Chapter rail ───────────────────────────── */

function ChapterRail({
  chapters,
  beats,
  activeId,
  onSelect,
  storyId,
}: {
  chapters: Chapter[]
  beats: Map<string, Beat[]>
  activeId: string | undefined
  onSelect: (id: string) => void
  storyId: string
}) {
  const { ordered, ids, reorder: move } = useOptimisticOrder(chapters, (next) => reorder('chapters', next))

  return (
    <aside className="shrink-0 lg:sticky lg:top-6 lg:w-[268px] lg:self-start">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11.5px] font-semibold tracking-[0.08em] text-faint uppercase">Chapters</h2>
        <Button variant="ghost" size="sm" onClick={async () => onSelect((await createChapter(storyId)).id)}>
          <Plus /> Add
        </Button>
      </div>
      <SortableList ids={ids} onReorder={move}>
        <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {ordered.map((c, i) => {
            const list = beats.get(c.id) ?? []
            const active = c.id === activeId
            return (
              <SortableItem key={c.id} id={c.id}>
                {(handle) => (
                  <div
                    className={cn(
                      'group/ch flex min-w-[200px] items-start gap-1 rounded-xl py-2.5 pr-3 pl-1 transition-colors lg:min-w-0',
                      active ? 'bg-surface shadow-soft ring-1 ring-line' : 'hover:bg-surface-2',
                    )}
                  >
                    <button
                      {...handle.attributes}
                      {...handle.listeners}
                      className="mt-0.5 cursor-grab touch-none rounded p-0.5 text-line-strong opacity-0 group-hover/ch:opacity-100 focus:opacity-100"
                      aria-label={`Reorder chapter ${i + 1}`}
                    >
                      <GripVertical size={14} />
                    </button>
                    <button onClick={() => onSelect(c.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[11.5px] font-medium text-faint tabular-nums">{i + 1}</span>
                        <span className={cn('truncate font-serif text-[15px]', active ? 'text-ink' : 'text-muted', !c.title && 'italic')}>
                          {c.title || 'Untitled chapter'}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 pl-4">
                        <Readiness beats={list} />
                        <span className="text-[11px] text-faint">{plural(list.length, 'beat')}</span>
                      </div>
                    </button>
                  </div>
                )}
              </SortableItem>
            )
          })}
        </div>
      </SortableList>
      <div className="mt-4 hidden flex-wrap gap-x-3 gap-y-1 pl-2 lg:flex">
        {BEAT_STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-[11px] text-faint">
            <span className={cn('h-1.5 w-1.5 rounded-full', BEAT_STATUS[s].dot)} />
            {BEAT_STATUS[s].label}
          </span>
        ))}
      </div>
    </aside>
  )
}

/** One segment per beat, coloured by status — a quiet map of how planned a chapter is. */
function Readiness({ beats }: { beats: Beat[] }) {
  if (beats.length === 0) return <span className="h-1 w-10 rounded-full bg-surface-3" />
  return (
    <span className="flex gap-0.5">
      {beats.slice(0, 16).map((b) => (
        <span key={b.id} className={cn('h-1 w-2.5 rounded-full', BEAT_STATUS[b.status].bar)} />
      ))}
    </span>
  )
}

/* ───────────────────────────── Chapter panel ───────────────────────────── */

function ChapterPanel({
  chapter,
  index,
  chapters,
  beats,
  prose,
  characters,
  castIds,
  initialBeat,
  selected,
  setSelected,
  onDeleted,
}: {
  chapter: Chapter
  index: number
  chapters: Chapter[]
  beats: Beat[]
  prose: Map<string, Draft>
  characters: Map<string, Character>
  castIds: string[]
  initialBeat: string | null
  selected: string[]
  setSelected: (fn: (s: string[]) => string[]) => void
  onDeleted: () => void
}) {
  const set = (patch: Partial<Chapter>) => updateChapter(chapter.id, patch)
  const [expanded, setExpanded] = useState<string | null>(initialBeat)
  const [showDetails, setShowDetails] = useState(!chapter.purpose && !chapter.summary ? true : false)
  const { quickCopy, openComposer } = useComposer()
  const { openAi } = useAi()
  const { confirm, element } = useConfirm()
  const { ordered, ids, reorder: move } = useOptimisticOrder(beats, (next) => reorder('beats', next))
  const pov = chapter.povCharacterId ? characters.get(chapter.povCharacterId) : undefined
  const words = beats.reduce((n, b) => n + (b.targetWords ?? 0), 0)
  const writtenWords = beats.reduce((n, b) => n + wordCount(prose.get(b.id)?.text ?? ''), 0)
  const [mode, setMode] = useState<'plan' | 'write' | 'read'>('plan')

  useEffect(() => {
    if (initialBeat) setExpanded(initialBeat)
  }, [initialBeat])

  const addBeat = async () => {
    const b = await createBeat(chapter.id)
    setExpanded(b.id)
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0 text-[11.5px] font-semibold tracking-[0.08em] text-faint uppercase">
          Chapter {index + 1} · {plural(beats.length, 'beat')}
          {words > 0 && ` · ~${words.toLocaleString()} planned`}
          {writtenWords > 0 && ` · ${writtenWords.toLocaleString()} written`}
        </span>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="primary" onClick={() => quickCopy(chapter.storyId, { kind: 'chapter', chapterId: chapter.id })}>
            <Copy /> Copy chapter prompt
          </Button>
          <Button size="sm" onClick={() => openComposer(chapter.storyId, { kind: 'chapter', chapterId: chapter.id })}>
            <Sparkles /> Compose…
          </Button>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Chapter actions">
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={<Lightbulb />} onSelect={() => openAi({ kind: 'brainstorm', chapterId: chapter.id })}>
                Brainstorm beats…
              </MenuItem>
              <MenuItem icon={<Wand2 />} onSelect={() => openAi({ kind: 'chapter', chapterId: chapter.id })}>
                Edit chapter with AI…
              </MenuItem>
              <MenuItem
                danger
                icon={<Trash2 />}
                onSelect={async () => {
                  if (await confirm(`Delete chapter ${index + 1}?`, { body: `Its ${plural(beats.length, 'beat')} will be deleted too.` })) {
                    await deleteChapter(chapter.id)
                    onDeleted()
                  }
                }}
              >
                Delete chapter
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>

      <TextInput
        variant="quiet"
        value={chapter.title}
        onCommit={(title) => set({ title })}
        placeholder="Name this chapter"
        className="font-serif text-[30px] leading-tight tracking-tight"
        aria-label="Chapter title"
      />
      <TextArea
        variant="quiet"
        minRows={1}
        value={chapter.purpose}
        onCommit={(purpose) => set({ purpose })}
        placeholder="What is this chapter for? What must be different by the end of it?"
        className="mt-1 text-[15px] text-muted"
        aria-label="Chapter purpose"
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px]">
        <span className="flex items-center gap-2">
          <span className="text-faint">POV</span>
          <CharacterPicker
            single
            selected={chapter.povCharacterId ? [chapter.povCharacterId] : []}
            onChange={([id]) => set({ povCharacterId: id ?? null })}
            pool={castIds}
            trigger={
              <button className="rounded-lg px-1.5 py-0.5 text-ink hover:bg-surface-2">{pov?.name ?? <span className="text-faint">Choose…</span>}</button>
            }
          />
        </span>
        <span className="flex items-center gap-2">
          <span className="text-faint">In this chapter</span>
          <CharacterChips ids={chapter.characterIds} characters={characters} onChange={(characterIds) => set({ characterIds })} pool={castIds} placeholder="Add" />
        </span>
        <button onClick={() => setShowDetails((s) => !s)} className="ml-auto flex items-center gap-1 text-faint hover:text-ink">
          Setting & summary <ChevronDown size={14} className={cn('transition-transform', showDetails && 'rotate-180')} />
        </button>
      </div>

      {showDetails && (
        <div className="mt-4 grid animate-fade-in gap-4 rounded-2xl bg-surface-2/50 p-5 md:grid-cols-2">
          <Field label="Setting">
            <TextArea minRows={1} value={chapter.setting} onCommit={(setting) => set({ setting })} placeholder="Where and when?" />
          </Field>
          <Field label="Summary" hint="Used as “story so far” for later chapters. Write it after the chapter exists.">
            <TextArea minRows={1} value={chapter.summary} onCommit={(summary) => set({ summary })} placeholder="What happened, in two sentences." />
          </Field>
          <Field label="Private notes" className="md:col-span-2">
            <TextArea minRows={1} value={chapter.notes} onCommit={(notes) => set({ notes })} placeholder="Ideas, doubts, reminders — never exported by default." />
          </Field>
        </div>
      )}

      <div className="mt-8 mb-4 flex items-center justify-between gap-3">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'plan', label: 'Plan' },
            { value: 'write', label: 'Write' },
            { value: 'read', label: writtenWords ? `Read · ${writtenWords.toLocaleString()} words` : 'Read' },
          ]}
        />
        {mode === 'plan' && beats.length > 0 && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" aria-label="Brainstorm" title="Brainstorm beats" onClick={() => openAi({ kind: 'brainstorm', chapterId: chapter.id })}>
              <Lightbulb /> <span className="max-sm:hidden">Brainstorm</span>
            </Button>
            <Button size="sm" variant="ghost" aria-label="Edit beats with AI" title="Edit beats with AI" onClick={() => openAi({ kind: 'chapter', chapterId: chapter.id })}>
              <Wand2 /> <span className="max-sm:hidden">Edit with AI</span>
            </Button>
          </div>
        )}
      </div>

      {mode === 'read' ? (
        <ReadingView chapter={chapter} beats={beats} prose={prose} />
      ) : mode === 'write' ? (
        <WriteView
          chapter={chapter}
          beats={beats}
          prose={prose}
          onEditBeat={(id) => {
            setMode('plan')
            setExpanded(id)
          }}
        />
      ) : (
      <div>
        {beats.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong px-8 py-12 text-center">
            <p className="font-serif text-[18px] text-ink">No beats yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted">
              A beat is one movement of a scene — a glance, a decision, a confession. Plan three or four before you write a word.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => openAi({ kind: 'brainstorm', chapterId: chapter.id })}>
                <Lightbulb /> Brainstorm beats
              </Button>
              <Button onClick={addBeat}>
                <Plus /> First beat
              </Button>
            </div>
          </div>
        ) : (
          <SortableList ids={ids} onReorder={move}>
            <div className="space-y-2.5">
              {ordered.map((b, i) => (
                <SortableItem key={b.id} id={b.id}>
                  {(handle, dragging) => (
                    <BeatCard
                      beat={b}
                      index={i}
                      chapter={chapter}
                      chapters={chapters}
                      characters={characters}
                      castIds={castIds}
                      expanded={expanded === b.id}
                      onToggle={() => setExpanded((e) => (e === b.id ? null : b.id))}
                      selected={selected.includes(b.id)}
                      selecting={selected.length > 0}
                      onSelect={() => setSelected((s) => (s.includes(b.id) ? s.filter((x) => x !== b.id) : [...s, b.id]))}
                      handle={handle}
                      dragging={dragging}
                      proseWords={wordCount(prose.get(b.id)?.text ?? '')}
                    />
                  )}
                </SortableItem>
              ))}
            </div>
          </SortableList>
        )}
        {beats.length > 0 && (
          <button
            onClick={addBeat}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line py-3 text-[13px] text-faint transition-colors hover:border-line-strong hover:bg-surface hover:text-muted"
          >
            <Plus size={15} /> Add beat
          </button>
        )}
      </div>
      )}
      {element}
    </div>
  )
}
