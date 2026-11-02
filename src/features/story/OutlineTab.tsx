import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowDown, ArrowUp, CheckSquare, ClipboardList, ClipboardPaste, Copy, GripVertical, Layers, Lightbulb, MoreHorizontal, Plus, SlidersHorizontal, Trash2, Wand2, X } from 'lucide-react'
import { useCharacters } from '@/db/hooks'
import { addDraft, createBeat, createChapter, deleteBeat, deleteChapter, reorder } from '@/db/repo'
import type { Beat, Chapter } from '@/db/types'
import { readClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { wordCount } from '@/lib/text'
import { Avatar, Button, Tick } from '@/components/ui/primitives'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Sheet, useToast } from '@/components/ui/overlays'
import { SortableItem, SortableList, useOptimisticOrder, type HandleProps } from '@/components/ui/Sortable'
import { Scroll } from '@/components/layout/Screen'
import { useAi } from '@/features/ai/ai-context'
import { useComposer } from '@/features/export/composer-context'
import { BEAT_STATUS } from '@/features/stories/status'
import { BeatEditor, BeatSheet } from './BeatEditor'
import { ChapterDetails } from './ChapterDetails'
import { useBeatParam, useStoryCtx } from './StoryShell'
import { useIsDesktop } from '@/lib/media'

/**
 * Outline: desktop is three fixed panes (chapters · beats · inspector);
 * phone is the beat list, with the chapter strip above and beats opening
 * as a full-screen sheet.
 */
export function OutlineTab() {
  const { story, chapter, beats } = useStoryCtx()
  const characters = useCharacters()
  const charMap = useMemo(() => new Map((characters ?? []).map((c) => [c.id, c])), [characters])
  const { beatId, open, close } = useBeatParam()
  const desktop = useIsDesktop()
  const navigate = useNavigate()
  const list = chapter ? (beats.get(chapter.id) ?? []) : []
  const beat = beatId ? list.find((b) => b.id === beatId) ?? [...beats.values()].flat().find((b) => b.id === beatId) : undefined
  const castIds = story.cast.map((m) => m.characterId)

  if (!chapter)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
        <Button variant="primary" onClick={() => navigate(`/new?story=${story.id}`)}>
          <Wand2 /> Outline with AI
        </Button>
        <Button variant="ghost" onClick={() => createChapter(story.id, { title: 'Chapter one' })}>
          <Plus /> Add a chapter
        </Button>
      </div>
    )

  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[232px_minmax(0,1fr)_minmax(360px,440px)]">
      <ChapterList />
      <Scroll className="lg:border-r lg:border-line">
        <BeatList chapter={chapter} beats={list} openBeat={(id) => open(id, { replace: desktop })} selectedId={beat?.id} />
      </Scroll>
      {/* Inspector (desktop): the selected beat, or the chapter's details. */}
      {desktop && (
      <div className="min-h-0">
        {beat ? (
          <BeatEditor key={beat.id} beat={beat} characters={charMap} onClose={close} onStep={(id) => open(id, { replace: true })} variant="panel" />
        ) : (
          <Scroll className="bg-surface">
            <div className="px-5 py-5">
              <p className="mb-4 text-[11.5px] font-semibold tracking-[0.08em] text-faint uppercase">Chapter {chapter.order + 1}</p>
              <ChapterDetails key={chapter.id} chapter={chapter} characters={charMap} castIds={castIds} />
            </div>
          </Scroll>
        )}
      </div>
      )}
      {beat && !desktop && <BeatSheet key={beat.id} beat={beat} characters={charMap} onClose={close} onStep={(id) => open(id, { replace: true })} variant="sheet" />}
    </div>
  )
}

/* ───────────── Desktop chapter list ───────────── */

function ChapterList() {
  const { story, chapters, chapter, beats, prose, selectChapter } = useStoryCtx()
  const { ordered, ids, reorder: move } = useOptimisticOrder(chapters, (next) => reorder('chapters', next))
  return (
    <Scroll className="hidden border-r border-line bg-surface-2/40 lg:block">
      <div className="space-y-0.5 p-2">
        <SortableList ids={ids} onReorder={move}>
          {ordered.map((c, i) => {
            const list = beats.get(c.id) ?? []
            const done = list.filter((b) => prose.has(b.id)).length
            return (
              <SortableItem key={c.id} id={c.id}>
                {(handle) => (
                  <div className={cn('group flex items-center rounded-lg', c.id === chapter?.id ? 'bg-surface shadow-soft' : 'hover:bg-surface-2')}>
                    <button {...handle.attributes} {...handle.listeners} aria-label={`Reorder chapter ${i + 1}`} className="cursor-grab touch-none px-1 py-2.5 text-line-strong can-hover:opacity-0 can-hover:group-hover:opacity-100">
                      <GripVertical size={14} />
                    </button>
                    <button onClick={() => selectChapter(c.id)} className="flex min-w-0 flex-1 items-baseline gap-2 py-2 pr-2.5 text-left">
                      <span className="text-[12px] text-faint tabular-nums">{i + 1}</span>
                      <span className={cn('min-w-0 flex-1 truncate font-serif text-[15px]', c.id === chapter?.id ? 'text-ink' : 'text-muted')}>{c.title || 'Untitled'}</span>
                      {list.length > 0 && <span className="text-[11.5px] text-faint tabular-nums">{done}/{list.length}</span>}
                    </button>
                  </div>
                )}
              </SortableItem>
            )
          })}
        </SortableList>
        <button onClick={async () => selectChapter((await createChapter(story.id)).id)} className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-[13px] text-faint hover:bg-surface-2 hover:text-ink">
          <Plus size={14} /> Chapter
        </button>
      </div>
    </Scroll>
  )
}

/* ───────────── Chapter header + beat list ───────────── */

function BeatList({ chapter, beats, openBeat, selectedId }: { chapter: Chapter; beats: Beat[]; openBeat: (id: string) => void; selectedId?: string }) {
  const { story, chapters, prose, selectChapter } = useStoryCtx()
  const characters = useCharacters()
  const charMap = useMemo(() => new Map((characters ?? []).map((c) => [c.id, c])), [characters])
  const { openAi } = useAi()
  const { quickCopy, openComposer } = useComposer()
  const toast = useToast()
  const [details, setDetails] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const { ordered, ids, reorder: move } = useOptimisticOrder(beats, (next) => reorder('beats', next))
  const index = chapters.findIndex((c) => c.id === chapter.id)

  const addBeat = async () => openBeat((await createBeat(chapter.id)).id)
  const moveBy = (id: string, delta: number) => {
    const i = ids.indexOf(id)
    const j = i + delta
    if (j < 0 || j >= ids.length) return
    const next = [...ids]
    next.splice(j, 0, next.splice(i, 1)[0]!)
    move(next)
  }
  const moveChapter = (delta: number) => {
    const order = chapters.map((c) => c.id)
    const j = index + delta
    if (j < 0 || j >= order.length) return
    order.splice(j, 0, order.splice(index, 1)[0]!)
    void reorder('chapters', order)
  }

  return (
    <div className="mx-auto w-full max-w-2xl pb-28 lg:pb-10">
      {/* Compact chapter header */}
      <div className="flex items-start gap-2 px-4 pt-4 pb-3">
        <button className="min-w-0 flex-1 text-left lg:pointer-events-none" onClick={() => setDetails(true)} aria-label="Chapter details">
          <h2 className="truncate font-serif text-[22px] leading-tight">{chapter.title || `Chapter ${index + 1}`}</h2>
          {chapter.purpose ? <p className="line-clamp-1 text-[14px] text-muted">{chapter.purpose}</p> : <p className="text-[14px] text-faint lg:hidden">Add a purpose</p>}
        </button>
        <Button variant="ghost" size="icon" onClick={() => setDetails(true)} aria-label="Chapter details" className="lg:hidden">
          <SlidersHorizontal />
        </Button>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Chapter actions">
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={<Lightbulb />} onSelect={() => openAi({ kind: 'brainstorm', chapterId: chapter.id })}>
              Brainstorm beats
            </MenuItem>
            <MenuItem icon={<Wand2 />} onSelect={() => openAi({ kind: 'chapter', chapterId: chapter.id })}>
              Edit with AI
            </MenuItem>
            <MenuItem icon={<ClipboardList />} onSelect={() => openComposer(story.id, { kind: 'chapter', chapterId: chapter.id })}>
              Prompt options
            </MenuItem>
            <MenuItem icon={<CheckSquare />} onSelect={() => setSelecting(true)}>
              Select beats
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<ArrowUp />} onSelect={() => moveChapter(-1)}>
              Move chapter earlier
            </MenuItem>
            <MenuItem icon={<ArrowDown />} onSelect={() => moveChapter(1)}>
              Move chapter later
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              danger
              icon={<Trash2 />}
              onSelect={async () => {
                const undo = await deleteChapter(chapter.id)
                const other = chapters.find((c) => c.id !== chapter.id)
                if (other) selectChapter(other.id)
                toast('Chapter deleted', chapter.title || undefined, { action: { label: 'Undo', run: undo } })
              }}
            >
              Delete chapter
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      {beats.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-16">
          <Button variant="primary" onClick={() => openAi({ kind: 'brainstorm', chapterId: chapter.id })}>
            <Lightbulb /> Brainstorm beats
          </Button>
          <Button variant="ghost" onClick={addBeat}>
            <Plus /> Add a beat
          </Button>
        </div>
      ) : (
        <SortableList ids={ids} onReorder={move}>
          <ul className="border-y border-line bg-surface lg:mx-4 lg:rounded-xl lg:border">
            {ordered.map((b, i) => (
              <SortableItem key={b.id} id={b.id}>
                {(handle, dragging) => (
                  <BeatRow
                    beat={b}
                    index={i}
                    last={i === ordered.length - 1}
                    words={wordCount(prose.get(b.id)?.text ?? '')}
                    people={(b.characterIds.length ? b.characterIds : chapter.characterIds).map((id) => charMap.get(id)).filter((c): c is NonNullable<typeof c> => !!c)}
                    handle={handle}
                    dragging={dragging}
                    active={b.id === selectedId}
                    selecting={selecting}
                    selected={selected.includes(b.id)}
                    onOpen={() => (selecting ? setSelected((s) => (s.includes(b.id) ? s.filter((x) => x !== b.id) : [...s, b.id])) : openBeat(b.id))}
                    onCopy={() => quickCopy(story.id, { kind: 'beat', beatId: b.id })}
                    onPaste={async () => {
                      const t = await readClipboard()
                      if (!t?.trim()) return toast('Clipboard is empty')
                      await addDraft(b.id, t)
                      toast('Prose saved', `${wordCount(t).toLocaleString()} words`)
                    }}
                    onMove={(d) => moveBy(b.id, d)}
                    onInsert={async () => openBeat((await createBeat(chapter.id, {}, b.order)).id)}
                    onDelete={async () => {
                      const undo = await deleteBeat(b.id)
                      toast('Beat deleted', b.title || undefined, { action: { label: 'Undo', run: undo } })
                    }}
                    onRefine={() => openAi({ kind: 'beat', beatId: b.id })}
                  />
                )}
              </SortableItem>
            ))}
          </ul>
        </SortableList>
      )}
      {beats.length > 0 && (
        <button onClick={addBeat} className="mt-1 flex h-12 w-full items-center gap-2 px-5 text-[14px] text-faint hover:text-ink lg:mx-4 lg:w-auto">
          <Plus size={16} /> Add beat
        </button>
      )}

      {selecting && (
        <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom,0px))] z-20 flex justify-center px-3 lg:bottom-6">
          <div className="flex items-center gap-1.5 rounded-2xl border border-line bg-surface p-1.5 pl-4 shadow-lift">
            <span className="whitespace-nowrap text-[14px] tabular-nums">{selected.length} selected</span>
            <Button variant="primary" size="sm" disabled={!selected.length} onClick={() => quickCopy(story.id, { kind: 'selection', beatIds: ids.filter((id) => selected.includes(id)) })}>
              <Copy /> Copy prompt
            </Button>
            <Button size="sm" disabled={!selected.length} onClick={() => openComposer(story.id, { kind: 'selection', beatIds: ids.filter((id) => selected.includes(id)) })}>
              <ClipboardList /> Options
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Stop selecting"
              onClick={() => {
                setSelecting(false)
                setSelected([])
              }}
            >
              <X />
            </Button>
          </div>
        </div>
      )}

      <Sheet open={details} onOpenChange={setDetails} title="Chapter details">
        <div className="overflow-y-auto px-4 pt-3 pb-6">
          <ChapterDetails chapter={chapter} characters={charMap} castIds={story.cast.map((m) => m.characterId)} />
        </div>
      </Sheet>
    </div>
  )
}

function BeatRow({
  beat,
  index,
  last,
  words,
  people,
  handle,
  dragging,
  active,
  selecting,
  selected,
  onOpen,
  onCopy,
  onPaste,
  onMove,
  onInsert,
  onDelete,
  onRefine,
}: {
  beat: Beat
  index: number
  last: boolean
  words: number
  people: { id: string; name: string; color: string }[]
  handle: HandleProps
  dragging: boolean
  active: boolean
  selecting: boolean
  selected: boolean
  onOpen: () => void
  onCopy: () => void
  onPaste: () => void
  onMove: (delta: number) => void
  onInsert: () => void
  onDelete: () => void
  onRefine: () => void
}) {
  const status = words > 0 ? { label: `${words.toLocaleString()} words`, cls: 'bg-ok/12 text-ok' } : beat.status === 'ready' ? { label: 'Ready', cls: 'bg-accent-soft text-accent' } : { label: BEAT_STATUS[beat.status].label, cls: 'bg-surface-2 text-muted' }
  return (
    <li className={cn('group flex items-stretch border-line bg-surface', !last && 'border-b', active && 'bg-accent-soft/40', dragging && 'shadow-lift')}>
      {selecting ? (
        <span className="flex w-11 shrink-0 items-center justify-center">
          <Tick on={selected} />
        </span>
      ) : (
        <button {...handle.attributes} {...handle.listeners} aria-label={`Reorder beat ${index + 1}`} className="flex w-9 shrink-0 cursor-grab touch-none items-center justify-center text-line-strong active:cursor-grabbing can-hover:opacity-0 can-hover:group-hover:opacity-100">
          <GripVertical size={16} />
        </button>
      )}
      <button onClick={onOpen} className="min-w-0 flex-1 py-3 pr-2 text-left">
        <span className="flex items-baseline gap-2">
          <span className="text-[12px] text-faint tabular-nums">{index + 1}</span>
          <span className={cn('min-w-0 flex-1 truncate font-serif text-[17px] leading-snug', !beat.title && 'text-faint')}>{beat.title || 'Untitled beat'}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className="line-clamp-1 min-w-0 flex-1 text-[13.5px] text-muted">{beat.description || '—'}</span>
        </span>
        <span className="mt-1.5 flex items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-medium', status.cls)}>{status.label}</span>
          {people.length > 0 && (
            <span className="flex -space-x-1">
              {people.slice(0, 4).map((p) => (
                <Avatar key={p.id} name={p.name} color={p.color} size={18} />
              ))}
            </span>
          )}
        </span>
      </button>
      {!selecting && (
        <Menu>
          <MenuTrigger asChild>
            <button aria-label={`Actions for beat ${index + 1}`} className="flex w-11 shrink-0 items-center justify-center text-faint hover:text-ink">
              <MoreHorizontal size={18} />
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={<Copy />} onSelect={onCopy}>
              Copy prompt
            </MenuItem>
            <MenuItem icon={<ClipboardPaste />} onSelect={onPaste}>
              Paste result
            </MenuItem>
            <MenuItem icon={<Wand2 />} onSelect={onRefine}>
              Refine with AI
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<ArrowUp />} onSelect={() => onMove(-1)}>
              Move up
            </MenuItem>
            <MenuItem icon={<ArrowDown />} onSelect={() => onMove(1)}>
              Move down
            </MenuItem>
            <MenuItem icon={<Plus />} onSelect={onInsert}>
              Insert beat after
            </MenuItem>
            <MenuItem icon={<Layers />} onSelect={onOpen}>
              Open
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger icon={<Trash2 />} onSelect={onDelete}>
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
    </li>
  )
}
