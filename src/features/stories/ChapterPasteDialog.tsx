import { useMemo, useState } from 'react'
import { AlertTriangle, Check, ClipboardPaste } from 'lucide-react'
import { addDraft } from '@/db/repo'
import type { Beat, Draft } from '@/db/types'
import { splitChapterReply } from '@/export/split'
import { readClipboard } from '@/lib/clipboard'
import { plural, wordCount } from '@/lib/text'
import { Button, Field, Select } from '@/components/ui/primitives'
import { Dialog, useToast } from '@/components/ui/overlays'

/**
 * Paste a whole chapter written in one go. The chapter prompt asks the AI to
 * put [[Beat N]] markers before each beat; we split on them and save each
 * part as a new prose version on the matching beat.
 */
export function ChapterPasteDialog({
  beats,
  prose,
  onClose,
  polish,
}: {
  beats: Beat[]
  prose: Map<string, Draft>
  onClose: () => void
  /** Pasting a polish pass rather than a first draft. */
  polish?: boolean
}) {
  const toast = useToast()
  const [reply, setReply] = useState('')
  const firstUnwritten = beats.find((b) => !prose.has(b.id))?.id ?? beats[0]?.id ?? ''
  const [fallbackBeat, setFallbackBeat] = useState(firstUnwritten)

  const split = useMemo(() => (reply.trim() ? splitChapterReply(reply) : null), [reply])
  const assignments = useMemo(() => {
    if (!split) return []
    if (!split.found) return fallbackBeat ? [{ beat: beats.find((b) => b.id === fallbackBeat)!, text: reply.trim() }] : []
    return split.parts
      .map((p, i) => ({ beat: beats[p.beat - 1], text: i === 0 && split.preamble ? `${split.preamble}\n\n${p.text}` : p.text }))
      .filter((a): a is { beat: Beat; text: string } => !!a.beat)
  }, [split, beats, fallbackBeat, reply])
  const unknown = split?.found ? split.parts.filter((p) => !beats[p.beat - 1]).map((p) => p.beat) : []

  const paste = async () => {
    const t = await readClipboard()
    if (t?.trim()) setReply(t)
    else toast('Couldn’t read the clipboard', 'paste into the box instead')
  }

  const save = async () => {
    for (const a of assignments) await addDraft(a.beat.id, a.text, polish ? 'ai-rewrite' : 'pasted', polish ? 'Polish pass' : 'Whole-chapter paste')
    const words = assignments.reduce((n, a) => n + wordCount(a.text), 0)
    toast(`Saved ${assignments.length} beat${assignments.length === 1 ? '' : 's'}`, `${words.toLocaleString()} words`)
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={polish ? 'Paste the polished chapter' : 'Paste a whole chapter'}
      description={
        polish
          ? 'Paste the revised chapter. It’s split at the [[Beat N]] markers and saved as a new version of each beat — the originals are kept.'
          : 'Paste the AI’s reply to the chapter prompt. It’s split at the [[Beat N]] markers and filed under each beat.'
      }
      className="max-w-2xl max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0"
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <div className="flex gap-2">
          <Button variant="primary" onClick={paste}>
            <ClipboardPaste /> Paste from clipboard
          </Button>
          {reply && (
            <Button variant="ghost" onClick={() => setReply('')}>
              Clear
            </Button>
          )}
        </div>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={5}
          placeholder="…or long-press → Paste here"
          className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 font-serif text-[15px] leading-relaxed outline-none focus:border-accent/60 max-sm:text-[16px]"
        />

        {split && !split.found && (
          <div className="space-y-3 rounded-xl bg-warn/10 p-4 ring-1 ring-warn/30">
            <p className="flex gap-2 text-[13px]">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
              No [[Beat N]] markers found, so it can’t be split automatically. You can save it all under one beat, or ask the AI to “resend with the [[Beat N]] markers”.
            </p>
            <Field label="Save everything under">
              <Select value={fallbackBeat} onChange={setFallbackBeat} options={beats.map((b, i) => ({ value: b.id, label: `${i + 1}. ${b.title || 'Untitled beat'}` }))} />
            </Field>
          </div>
        )}
        {unknown.length > 0 && <p className="text-[12.5px] text-warn">Ignored markers for beats that don’t exist: {unknown.join(', ')}.</p>}

        {assignments.length > 0 && (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li key={a.beat.id} className="rounded-xl border border-line bg-surface px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-serif text-[15px]">
                    {beats.indexOf(a.beat) + 1}. {a.beat.title || 'Untitled beat'}
                  </span>
                  <span className="shrink-0 text-[12px] text-faint tabular-nums">{plural(wordCount(a.text), 'word')}</span>
                </div>
                <p className="mt-1 line-clamp-2 font-serif text-[13.5px] text-muted">{a.text}</p>
                {prose.has(a.beat.id) && <p className="mt-1 text-[11.5px] text-faint">Already written — this becomes a new version (the old one is kept).</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!assignments.length} onClick={save}>
          <Check /> Save {assignments.length || ''} beat{assignments.length === 1 ? '' : 's'}
        </Button>
      </div>
    </Dialog>
  )
}
