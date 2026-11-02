import { useState } from 'react'
import { ArrowRightLeft, ChevronLeft, ChevronRight, ClipboardList, ClipboardPaste, Copy, CopyPlus, MoreHorizontal, Plus, Trash2, Wand2, X } from 'lucide-react'
import { addDraft, createBeat, deleteBeat, duplicateBeat, moveBeatToChapter, updateBeat } from '@/db/repo'
import type { Beat, BeatStatus, Character } from '@/db/types'
import { readClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { wordCount } from '@/lib/text'
import { Button, Field, Segmented, TextArea, TextInput } from '@/components/ui/primitives'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, useToast } from '@/components/ui/overlays'
import { CharacterChips } from '@/features/characters/CharacterPicker'
import { useAi } from '@/features/ai/ai-context'
import { useComposer } from '@/features/export/composer-context'
import { ProsePanel } from '@/features/stories/ProsePanel'
import { BEAT_STATUS, BEAT_STATUSES } from '@/features/stories/status'
import { useStoryCtx } from './StoryShell'

type Section = 'plan' | 'direction' | 'prose'

/**
 * Everything about one beat, in three short sections instead of one long
 * form. Used as a full-screen sheet on phones and as the inspector column on
 * desktop. The two actions you need most are pinned at the bottom.
 */
export function BeatEditor({
  beat,
  characters,
  onClose,
  onStep,
  variant,
}: {
  beat: Beat
  characters: Map<string, Character>
  onClose: () => void
  onStep: (beatId: string) => void
  variant: 'sheet' | 'panel'
}) {
  const { story, chapters, beats, prose } = useStoryCtx()
  const { quickCopy, openComposer } = useComposer()
  const { openAi } = useAi()
  const toast = useToast()
  const draft = prose.get(beat.id)
  const [section, setSection] = useState<Section>(draft ? 'prose' : 'plan')
  const siblings = beats.get(beat.chapterId) ?? []
  const index = siblings.findIndex((b) => b.id === beat.id)
  const chapter = chapters.find((c) => c.id === beat.chapterId)
  const castIds = story.cast.map((m) => m.characterId)
  const set = (patch: Partial<Beat>) => updateBeat(beat.id, patch)
  const words = draft ? wordCount(draft.text) : 0

  const paste = async () => {
    const text = await readClipboard()
    if (!text?.trim()) {
      setSection('prose')
      toast('Clipboard is empty', 'paste into the Prose box instead')
      return
    }
    await addDraft(beat.id, text)
    setSection('prose')
    toast(draft ? 'Saved as a new version' : 'Prose saved', `${wordCount(text).toLocaleString()} words`)
  }

  const remove = async () => {
    const undo = await deleteBeat(beat.id)
    onClose()
    toast('Beat deleted', beat.title || undefined, { action: { label: 'Undo', run: undo } })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      {/* Header */}
      <div className={cn('box-content flex h-14 shrink-0 items-center gap-1 border-b border-line px-2', variant === 'sheet' && 'pt-[env(safe-area-inset-top,0px)]')}>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close beat">
          <X />
        </Button>
        <div className="min-w-0 flex-1 px-1">
          <p className="text-[11.5px] font-semibold tracking-[0.08em] text-faint uppercase">
            Beat {index + 1} of {siblings.length}
          </p>
          <p className="truncate font-serif text-[17px] leading-tight">{beat.title || 'Untitled beat'}</p>
        </div>
        <Button variant="ghost" size="icon" disabled={index <= 0} onClick={() => onStep(siblings[index - 1]!.id)} aria-label="Previous beat">
          <ChevronLeft />
        </Button>
        <Button variant="ghost" size="icon" disabled={index >= siblings.length - 1} onClick={() => onStep(siblings[index + 1]!.id)} aria-label="Next beat">
          <ChevronRight />
        </Button>
      </div>

      <div className="shrink-0 px-4 pt-3">
        <Segmented<Section>
          value={section}
          onChange={setSection}
          options={[
            { value: 'plan', label: 'Plan' },
            { value: 'direction', label: 'Direction' },
            { value: 'prose', label: words ? `Prose · ${words.toLocaleString()}` : 'Prose' },
          ]}
        />
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-6">
        {section === 'plan' && (
          <div className="space-y-5">
            <Field label="Title">
              <TextInput value={beat.title} onCommit={(title) => set({ title })} placeholder="Name this beat" autoFocus={!beat.title && !beat.description} />
            </Field>
            <Field label="What happens">
              <TextArea minRows={4} value={beat.description} onCommit={(description) => set({ description })} placeholder="Who does what — and what's different by the end?" />
            </Field>
            <Field label="On the page">
              <CharacterChips ids={beat.characterIds} characters={characters} onChange={(characterIds) => set({ characterIds })} pool={castIds} inheritedFrom={{ label: 'chapter', ids: chapter?.characterIds ?? [] }} />
            </Field>
            <Field label="Emotional state">
              <TextArea value={beat.emotion} onCommit={(emotion) => set({ emotion })} placeholder="What each person feels going in, and coming out" />
            </Field>
          </div>
        )}

        {section === 'direction' && (
          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Tone">
                <TextArea minRows={1} value={beat.tone} onCommit={(tone) => set({ tone })} placeholder="Tender, tense, playful…" />
              </Field>
              <Field label="Pacing">
                <TextArea minRows={1} value={beat.pacing} onCommit={(pacing) => set({ pacing })} placeholder="Linger here, cut fast there" />
              </Field>
              <Field label="Must include">
                <TextArea minRows={1} value={beat.mustInclude} onCommit={(mustInclude) => set({ mustInclude })} placeholder="Lines, images, moments" />
              </Field>
              <Field label="Must avoid">
                <TextArea minRows={1} value={beat.mustAvoid} onCommit={(mustAvoid) => set({ mustAvoid })} placeholder="What would break it" />
              </Field>
            </div>
            <Field label="Length (words)" className="w-40">
              <TextInput
                inputMode="numeric"
                value={beat.targetWords ? String(beat.targetWords) : ''}
                onCommit={(v) => {
                  const n = parseInt(v.replace(/[^\d]/g, ''), 10)
                  void set({ targetWords: Number.isFinite(n) && n > 0 ? n : null })
                }}
                placeholder="900"
              />
            </Field>
            <Field label="Status">
              <Segmented<BeatStatus> value={beat.status} onChange={(status) => set({ status })} options={BEAT_STATUSES.map((s) => ({ value: s, label: BEAT_STATUS[s].label.replace(' to write', '') }))} />
            </Field>
          </div>
        )}

        {section === 'prose' && <ProsePanel beat={beat} />}
      </div>

      {/* Pinned actions */}
      <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom,0px))]">
        <Button variant="primary" className="flex-1 justify-center" onClick={() => quickCopy(story.id, { kind: 'beat', beatId: beat.id })}>
          <Copy /> Copy prompt
        </Button>
        <Button className="flex-1 justify-center" onClick={paste}>
          <ClipboardPaste /> Paste result
        </Button>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More beat actions">
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={<ClipboardList />} onSelect={() => openComposer(story.id, { kind: 'beat', beatId: beat.id })}>
              Prompt options
            </MenuItem>
            <MenuItem icon={<Wand2 />} onSelect={() => openAi({ kind: 'beat', beatId: beat.id })}>
              Refine with AI
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Plus />} onSelect={async () => onStep((await createBeat(beat.chapterId, {}, beat.order)).id)}>
              Insert beat after
            </MenuItem>
            <MenuItem
              icon={<CopyPlus />}
              onSelect={async () => {
                const copy = await duplicateBeat(beat.id)
                if (copy) onStep(copy.id)
              }}
            >
              Duplicate
            </MenuItem>
            {chapters.length > 1 && (
              <>
                <MenuSeparator />
                <MenuLabel>Move to chapter</MenuLabel>
                {chapters
                  .filter((c) => c.id !== beat.chapterId)
                  .map((c) => (
                    <MenuItem key={c.id} icon={<ArrowRightLeft />} onSelect={() => moveBeatToChapter(beat.id, c.id)}>
                      {c.order + 1}. {c.title || 'Untitled'}
                    </MenuItem>
                  ))}
              </>
            )}
            <MenuSeparator />
            <MenuItem danger icon={<Trash2 />} onSelect={remove}>
              Delete beat
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </div>
  )
}

/** Phone wrapper: covers the screen; Back closes it (it's URL state). */
export function BeatSheet(props: Parameters<typeof BeatEditor>[0]) {
  return (
    <div className={cn('fixed inset-0 z-30 animate-rise lg:hidden')} role="dialog" aria-label={props.beat.title || 'Beat'}>
      <BeatEditor {...props} variant="sheet" />
    </div>
  )
}
