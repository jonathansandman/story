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
import { PASSAGE_TAIL_WORDS } from '@/export/build'

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
        <div className="rounded-2xl border border-dashed border-line-strong px-5 py-7 text-center">
          <p className="font-serif text-[18px] text-ink">Got the passage back?</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">Copy it from your writing AI, then paste it here. It stays linked to this beat, and the next beat's prompt will continue from it.</p>
          <Button variant="primary" className="mt-4" onClick={pasteNew}>
            <ClipboardPaste /> Paste from clipboard
          </Button>
        </div>
        <Field label="…or paste / type it here">
          <textarea
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            rows={5}
            placeholder="Long-press → Paste"
            className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 font-serif text-[16px] leading-relaxed outline-none focus:border-accent/60"
          />
        </Field>
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
      <p className="text-[12px] text-faint">Edits save to this version. The next beat's prompt quotes the last ~{PASSAGE_TAIL_WORDS} words so it continues seamlessly.</p>

      <div className="rounded-xl bg-ok/8 p-4 ring-1 ring-ok/20">
        <Field label="Recap — what actually happened" hint="1–3 sentences. Used as “story so far” in later prompts, instead of your plan.">
          <TextArea value={beat.recap} onCommit={(recap) => updateBeat(beat.id, { recap })} placeholder="Anything the prose added that later beats must respect." />
        </Field>
      </div>
      {element}
    </div>
  )
}
