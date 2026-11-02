import { useState } from 'react'
import { Check, ChevronDown, ClipboardPaste, Copy, History, Trash2 } from 'lucide-react'
import { useDrafts } from '@/db/hooks'
import { addDraft, deleteDraft, setActiveDraft, updateBeat, updateDraft } from '@/db/repo'
import type { Beat } from '@/db/types'
import { copyText, readClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { relativeTime, wordCount } from '@/lib/text'
import { Button, Field, TextArea } from '@/components/ui/primitives'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, useConfirm, useToast } from '@/components/ui/overlays'
import { PolishBox, RepeatsNote } from './PolishTools'

/**
 * Where prose comes back in. The loop is: copy beat prompt → write elsewhere →
 * paste the result here. Each paste is a new version; the active version is
 * what later prompts quote as "the end of the previous passage".
 */
export function ProsePanel({ beat }: { beat: Beat }) {
  const drafts = useDrafts(beat.id)
  const toast = useToast()
  const { confirm, element } = useConfirm()
  const [manual, setManual] = useState('')

  if (!drafts) return null
  const active = drafts.find((d) => d.id === beat.activeDraftId) ?? null
  const versionNo = (id: string) => drafts.length - drafts.findIndex((d) => d.id === id)

  const pasteNew = async () => {
    const text = await readClipboard()
    if (!text?.trim()) {
      toast('Clipboard is empty', 'or access was blocked — paste into the box instead')
      return
    }
    await addDraft(beat.id, text)
    toast(active ? 'Saved as a new version' : 'Prose saved', `${wordCount(text).toLocaleString()} words`)
  }

  /* ── Nothing written yet ── */
  if (!active) {
    return (
      <div className="space-y-4">
        <textarea
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          rows={8}
          aria-label="Prose"
          placeholder="Paste or write the passage"
          className="w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-3 font-serif text-[17px] leading-relaxed outline-none focus:border-accent/60"
        />
        {manual.trim() && (
          <Button
            variant="primary"
            onClick={async () => {
              await addDraft(beat.id, manual, 'typed')
              setManual('')
              toast('Prose saved')
            }}
          >
            <Check /> Save prose
          </Button>
        )}
        {element}
      </div>
    )
  }

  /* ── Has prose ── */
  const words = wordCount(active.text)
  const target = beat.targetWords
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" variant="subtle">
              <History /> v{versionNo(active.id)}
              {drafts.length > 1 && <span className="text-faint">of {drafts.length}</span>}
              <ChevronDown className="opacity-60" />
            </Button>
          </MenuTrigger>
          <MenuContent align="start">
            <MenuLabel>Versions</MenuLabel>
            {drafts.map((d) => (
              <MenuItem key={d.id} checked={d.id === active.id} onSelect={() => setActiveDraft(beat.id, d.id)}>
                v{versionNo(d.id)} · {wordCount(d.text).toLocaleString()} words · {relativeTime(d.createdAt)}
                {d.note && <span className="block text-[11.5px] text-faint">{d.note}</span>}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem icon={<ClipboardPaste />} onSelect={pasteNew}>
              Paste as new version
            </MenuItem>
            <MenuItem
              danger
              icon={<Trash2 />}
              onSelect={async () => {
                if (await confirm(`Delete version ${versionNo(active.id)}?`, { body: drafts.length > 1 ? 'The newest remaining version becomes active.' : 'This beat will have no prose.' })) await deleteDraft(active.id)
              }}
            >
              Delete this version
            </MenuItem>
          </MenuContent>
        </Menu>
        <span className={cn('text-[12px] tabular-nums', target && words > target * 1.5 ? 'text-warn' : 'text-faint')}>
          {words.toLocaleString()} words{target ? ` / ~${target.toLocaleString()}` : ''}
        </span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={pasteNew} title="Paste as new version">
            <ClipboardPaste /> <span className="max-sm:hidden">New version</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await copyText(active.text)
              toast('Prose copied')
            }}
          >
            <Copy /> <span className="max-sm:hidden">Copy</span>
          </Button>
        </div>
      </div>

      <TextArea
        key={active.id}
        minRows={6}
        value={active.text}
        onCommit={(text) => updateDraft(active.id, { text })}
        className="font-serif text-[17px] leading-[1.75]"
        aria-label="Prose"
      />
      <RepeatsNote text={active.text} />
      <PolishBox
        storyId={beat.storyId}
        beatIds={[beat.id]}
        label="beat"
        onPaste={async () => {
          const text = await readClipboard()
          if (!text?.trim()) {
            toast('Couldn’t read the clipboard', 'paste into the box and save as a new version')
            return
          }
          await addDraft(beat.id, text, 'ai-rewrite', 'Polish pass')
          toast('Polished version saved', `${wordCount(text).toLocaleString()} words · the previous version is kept`)
        }}
      />

      <div className="rounded-xl bg-ok/8 p-4 ring-1 ring-ok/20">
        <Field label="Recap for later prompts">
          <TextArea value={beat.recap} onCommit={(recap) => updateBeat(beat.id, { recap })} placeholder="Anything the prose added that later beats must respect." />
        </Field>
      </div>
      {element}
    </div>
  )
}
