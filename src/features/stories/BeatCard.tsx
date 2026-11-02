import { useEffect, useRef } from 'react'
import { ArrowRightLeft, Check, ChevronDown, Copy, CopyPlus, GripVertical, MoreHorizontal, Plus, Sparkles, Trash2 } from 'lucide-react'
import { deleteBeat, duplicateBeat, createBeat, moveBeatToChapter, updateBeat } from '@/db/repo'
import type { Beat, BeatStatus, Chapter, Character } from '@/db/types'
import { cn } from '@/lib/cn'
import { Avatar, Button, Field, Segmented, TextArea, TextInput } from '@/components/ui/primitives'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/overlays'
import type { HandleProps } from '@/components/ui/Sortable'
import { CharacterChips } from '@/features/characters/CharacterPicker'
import { useComposer } from '@/features/export/composer-context'
import { BEAT_STATUS, BEAT_STATUSES } from './status'

interface BeatCardProps {
  beat: Beat
  index: number
  chapter: Chapter
  chapters: Chapter[]
  characters: Map<string, Character>
  castIds: string[]
  expanded: boolean
  onToggle: () => void
  selected: boolean
  selecting: boolean
  onSelect: () => void
  handle: HandleProps
  dragging: boolean
}

export function BeatCard({ beat, index, chapter, chapters, characters, castIds, expanded, onToggle, selected, selecting, onSelect, handle, dragging }: BeatCardProps) {
  const { quickCopy, openComposer } = useComposer()
  const set = (patch: Partial<Beat>) => updateBeat(beat.id, patch)
  const status = BEAT_STATUS[beat.status]
  const people = (beat.characterIds.length ? beat.characterIds : chapter.characterIds).map((id) => characters.get(id)).filter((c): c is Character => !!c)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (expanded) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [expanded])

  return (
    <div
      ref={ref}
      className={cn(
        'group/beat relative rounded-2xl border bg-surface transition-[box-shadow,border-color] duration-200',
        expanded ? 'border-line-strong shadow-lift' : 'border-line shadow-soft hover:border-line-strong',
        selected && 'border-accent/50 ring-3 ring-accent/10',
        dragging && 'shadow-lift',
      )}
    >
      {/* ── Summary row ── */}
      <div className="flex items-start gap-1 py-3.5 pr-3 pl-1.5">
        <button
          {...handle.attributes}
          {...handle.listeners}
          className="mt-0.5 cursor-grab touch-none rounded p-1 text-line-strong opacity-0 transition-opacity group-hover/beat:opacity-100 hover:text-muted focus:opacity-100 active:cursor-grabbing"
          aria-label={`Reorder beat ${index + 1}`}
        >
          <GripVertical size={15} />
        </button>

        <button
          onClick={onSelect}
          className={cn(
            'mt-1 mr-1 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border transition-all',
            selected ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong bg-surface',
            selecting || selected ? 'opacity-100' : 'opacity-0 group-hover/beat:opacity-100 focus:opacity-100',
          )}
          aria-label={selected ? 'Deselect beat' : 'Select beat'}
          aria-pressed={selected}
        >
          {selected && <Check size={12} strokeWidth={3} />}
        </button>

        <button onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={expanded}>
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] font-medium text-faint tabular-nums">{String(index + 1).padStart(2, '0')}</span>
            <span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} title={status.label} />
            <span className={cn('truncate font-serif text-[16.5px] leading-snug', beat.title ? 'text-ink' : 'text-faint italic')}>
              {beat.title || 'Untitled beat'}
            </span>
          </div>
          {!expanded && (
            <p className={cn('mt-1 line-clamp-2 text-[13.5px] leading-relaxed', beat.description ? 'text-muted' : 'text-faint italic')}>
              {beat.description || 'What happens here? Click to plan this beat.'}
            </p>
          )}
          {!expanded && (people.length > 0 || beat.tone || beat.targetWords) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11.5px] text-faint">
              {people.length > 0 && (
                <span className="flex -space-x-1">
                  {people.map((p) => (
                    <Avatar key={p.id} name={p.name} color={p.color} size={18} />
                  ))}
                </span>
              )}
              {beat.tone && <span className="max-w-[260px] truncate">{beat.tone}</span>}
              {beat.targetWords ? <span>· ~{beat.targetWords.toLocaleString()} words</span> : null}
            </div>
          )}
        </button>

        <div className={cn('flex items-center gap-0.5 transition-opacity', expanded ? 'opacity-100' : 'opacity-0 group-hover/beat:opacity-100 focus-within:opacity-100')}>
          <Button variant="ghost" size="icon-sm" onClick={() => quickCopy(beat.storyId, { kind: 'beat', beatId: beat.id })} title="Copy beat as prompt" aria-label="Copy beat as prompt">
            <Copy />
          </Button>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Beat actions">
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={<Sparkles />} onSelect={() => openComposer(beat.storyId, { kind: 'beat', beatId: beat.id })}>
                Compose prompt…
              </MenuItem>
              <MenuItem icon={<Plus />} onSelect={() => createBeat(beat.chapterId, {}, beat.order)}>
                Insert beat below
              </MenuItem>
              <MenuItem icon={<CopyPlus />} onSelect={() => duplicateBeat(beat.id)}>
                Duplicate
              </MenuItem>
              {chapters.length > 1 && (
                <>
                  <MenuSeparator />
                  <MenuLabel>Move to</MenuLabel>
                  {chapters
                    .filter((c) => c.id !== beat.chapterId)
                    .map((c) => (
                      <MenuItem key={c.id} icon={<ArrowRightLeft />} onSelect={() => moveBeatToChapter(beat.id, c.id)}>
                        {c.order + 1}. {c.title || 'Untitled chapter'}
                      </MenuItem>
                    ))}
                </>
              )}
              <MenuSeparator />
              <MenuItem danger icon={<Trash2 />} onSelect={() => deleteBeat(beat.id)}>
                Delete beat
              </MenuItem>
            </MenuContent>
          </Menu>
          <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label={expanded ? 'Collapse' : 'Expand'}>
            <ChevronDown className={cn('transition-transform duration-200', expanded && 'rotate-180')} />
          </Button>
        </div>
      </div>

      {/* ── Editor ── */}
      {expanded && (
        <div className="animate-fade-in space-y-5 border-t border-line px-6 pt-5 pb-6 sm:pl-[58px]">
          <TextInput
            variant="quiet"
            value={beat.title}
            onCommit={(title) => set({ title })}
            placeholder="Give this beat a name"
            className="font-serif text-[20px]"
            autoFocus={!beat.title && !beat.description}
            aria-label="Beat title"
          />
          <Field label="What happens" hint="Concrete action. Who does what, and what changes by the end of this beat?">
            <TextArea minRows={3} value={beat.description} onCommit={(description) => set({ description })} placeholder="She sees June before June sees her. Then June turns around…" />
          </Field>

          <Field label="On the page" hint={beat.characterIds.length ? 'Only these characters’ sheets are exported with this beat.' : 'Inheriting from the chapter. Pick characters to narrow it.'}>
            <CharacterChips
              ids={beat.characterIds}
              characters={characters}
              onChange={(characterIds) => set({ characterIds })}
              pool={castIds}
              inheritedFrom={{ label: 'chapter', ids: chapter.characterIds }}
            />
          </Field>

          <Field label="Emotional state" hint="The single most useful thing you can tell the writing AI.">
            <TextArea value={beat.emotion} onCommit={(emotion) => set({ emotion })} placeholder="What does each person feel going in — and coming out?" />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Tone">
              <TextArea minRows={1} value={beat.tone} onCommit={(tone) => set({ tone })} placeholder="Tender, tense, playful…" />
            </Field>
            <Field label="Pacing">
              <TextArea minRows={1} value={beat.pacing} onCommit={(pacing) => set({ pacing })} placeholder="Linger here. Cut fast there." />
            </Field>
            <Field label="Must include">
              <TextArea minRows={1} value={beat.mustInclude} onCommit={(mustInclude) => set({ mustInclude })} placeholder="Lines, images, moments that have to land" />
            </Field>
            <Field label="Must avoid">
              <TextArea minRows={1} value={beat.mustAvoid} onCommit={(mustAvoid) => set({ mustAvoid })} placeholder="What would break this scene?" />
            </Field>
          </div>

          <div className="flex flex-wrap items-start gap-5">
            <Field label="Target length" className="w-36">
              <TextInput
                value={beat.targetWords ? String(beat.targetWords) : ''}
                onCommit={(v) => {
                  const n = parseInt(v.replace(/[^\d]/g, ''), 10)
                  void set({ targetWords: Number.isFinite(n) && n > 0 ? n : null })
                }}
                placeholder="e.g. 1200"
              />
            </Field>
            <Field label="Status" hint={status.hint}>
              <Segmented<BeatStatus>
                value={beat.status}
                onChange={(s) => set({ status: s })}
                options={BEAT_STATUSES.map((s) => ({ value: s, label: BEAT_STATUS[s].label.replace(' to write', '') }))}
              />
            </Field>
          </div>

          {beat.status === 'written' && (
            <div className="rounded-xl bg-ok/8 p-4 ring-1 ring-ok/20">
              <Field label="Recap — what actually happened" hint="1–3 sentences. Later beats use this for “story so far” instead of your plan.">
                <TextArea value={beat.recap} onCommit={(recap) => set({ recap })} placeholder="Include anything the prose added that later beats must respect." autoFocus={!beat.recap} />
              </Field>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button variant="primary" onClick={() => quickCopy(beat.storyId, { kind: 'beat', beatId: beat.id })}>
              <Copy /> Copy beat prompt
            </Button>
            <Button onClick={() => openComposer(beat.storyId, { kind: 'beat', beatId: beat.id })}>
              <Sparkles /> Compose…
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
