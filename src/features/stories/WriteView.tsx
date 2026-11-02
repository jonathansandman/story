import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ClipboardPaste, Copy, ExternalLink, Feather, Layers, Pencil } from 'lucide-react'
import { loadBundle } from '@/db/hooks'
import { addDraft } from '@/db/repo'
import type { Beat, Chapter, Draft } from '@/db/types'
import { buildFollowUp, buildPrompt } from '@/export/build'
import { render } from '@/export/render'
import { stripMarkers } from '@/export/split'
import { copyText, readClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { estimateTokens, wordCount } from '@/lib/text'
import { Button, Segmented } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/overlays'
import { optionsFor } from '@/features/export/composer-context'
import { ChapterPasteDialog } from './ChapterPasteDialog'
import { BEAT_STATUS } from './status'

type ChatMode = 'new' | 'same'
const MODE_KEY = 'trellis.writeChatMode'
const GROK_URL = 'https://grok.com/'

/**
 * Guided writing loop for one chapter, designed for a phone:
 *   Copy prompt → write in Grok → Paste reply → next beat.
 * In "same chat" mode, only the first prompt carries the full brief; later
 * ones are short follow-ups, so a long Grok conversation doesn't get bloated.
 */
export function WriteView({
  chapter,
  beats,
  prose,
  onEditBeat,
}: {
  chapter: Chapter
  beats: Beat[]
  prose: Map<string, Draft>
  onEditBeat: (beatId: string) => void
}) {
  const toast = useToast()
  const [index, setIndex] = useState(() => Math.max(0, beats.findIndex((b) => !prose.has(b.id))))
  const [mode, setMode] = useState<ChatMode>(() => {
    try {
      return (localStorage.getItem(MODE_KEY) as ChatMode | null) ?? 'same'
    } catch {
      return 'same'
    }
  })
  /** Has a full prompt been sent in this sitting? (Same-chat mode only.) */
  const [chatStarted, setChatStarted] = useState(false)
  const [copied, setCopied] = useState(false)
  const [justSaved, setJustSaved] = useState<{ beat: number; words: number } | null>(null)
  const [chapterPaste, setChapterPaste] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode)
    } catch {
      /* ignore */
    }
  }, [mode])
  useEffect(() => setCopied(false), [index])

  const beat = beats[index]
  if (!beat)
    return (
      <div className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center text-[13.5px] text-muted">
        Plan some beats first — Write mode walks through them one by one.
      </div>
    )

  const existing = prose.get(beat.id)
  const followUp = mode === 'same' && chatStarted
  const writtenCount = beats.filter((b) => prose.has(b.id)).length

  const copyPrompt = async () => {
    const bundle = await loadBundle(chapter.storyId)
    if (!bundle) return
    const options = optionsFor(bundle.story)
    const { doc } = followUp ? buildFollowUp(bundle, beat.id, options) : buildPrompt({ bundle, scope: { kind: 'beat', beatId: beat.id }, options })
    const out = render(doc, options.format)
    await copyText(out)
    setCopied(true)
    if (mode === 'same') setChatStarted(true)
    toast(followUp ? 'Follow-up copied' : 'Prompt copied', `~${estimateTokens(out).toLocaleString()} tokens`)
  }

  const copyChapterPrompt = async () => {
    const bundle = await loadBundle(chapter.storyId)
    if (!bundle) return
    const options = optionsFor(bundle.story)
    const out = render(buildPrompt({ bundle, scope: { kind: 'chapter', chapterId: chapter.id }, options }).doc, options.format)
    await copyText(out)
    toast('Chapter prompt copied', `~${estimateTokens(out).toLocaleString()} tokens`)
  }

  const paste = async () => {
    const raw = await readClipboard()
    const text = raw ? stripMarkers(raw) : ''
    if (!text) {
      toast('Couldn’t read the clipboard', 'open the beat and paste into its Prose box')
      return
    }
    await addDraft(beat.id, text)
    const words = wordCount(text)
    setJustSaved({ beat: index + 1, words })
    // Move on to the next unwritten beat after this one, if any.
    const next = beats.findIndex((b, i) => i > index && !prose.has(b.id))
    if (next >= 0) setIndex(next)
    else if (index < beats.length - 1) setIndex(index + 1)
    else toast('Chapter drafted', 'Switch to Read to see it all together')
  }

  return (
    <div className="space-y-5">
      {/* Progress */}
      <div>
        <div className="mb-2 flex items-center justify-between text-[12px] text-faint">
          <span>
            {writtenCount} of {beats.length} beats written
          </span>
          <Segmented<ChatMode>
            size="sm"
            value={mode}
            onChange={(m) => {
              setMode(m)
              setChatStarted(false)
            }}
            options={[
              { value: 'same', label: 'Same chat', title: 'Full brief once, then short follow-ups in the same Grok conversation' },
              { value: 'new', label: 'New chat each', title: 'Full brief every time' },
            ]}
          />
        </div>
        <div className="flex gap-1">
          {beats.map((b, i) => (
            <button
              key={b.id}
              onClick={() => setIndex(i)}
              title={`${i + 1}. ${b.title || 'Untitled'}`}
              aria-label={`Beat ${i + 1}`}
              className={cn(
                'h-2 flex-1 rounded-full transition-all',
                prose.has(b.id) ? 'bg-ok' : BEAT_STATUS[b.status].bar,
                i === index ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : 'opacity-70',
              )}
            />
          ))}
        </div>
      </div>

      {justSaved && (
        <p className="flex items-center gap-2 rounded-xl bg-ok/10 px-4 py-2.5 text-[13px] text-ink ring-1 ring-ok/25 animate-fade-in">
          <Check size={15} className="text-ok" /> Saved {justSaved.words.toLocaleString()} words to beat {justSaved.beat}.
          {mode === 'same' && <span className="text-muted">Next prompt is a short follow-up for the same chat.</span>}
        </p>
      )}

      {/* Current beat */}
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11.5px] font-semibold tracking-[0.08em] text-faint uppercase">
            Beat {index + 1} of {beats.length}
            {beat.targetWords ? ` · ~${beat.targetWords.toLocaleString()} words` : ''}
          </span>
          <div className="flex">
            <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Previous beat">
              <ArrowLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" disabled={index === beats.length - 1} onClick={() => setIndex(index + 1)} aria-label="Next beat">
              <ArrowRight />
            </Button>
          </div>
        </div>
        <h3 className="mt-1 font-serif text-[21px] leading-snug">{beat.title || 'Untitled beat'}</h3>
        <p className={cn('mt-1.5 text-[14px] leading-relaxed', beat.description ? 'text-muted' : 'text-faint italic')}>
          {beat.description || 'No plan yet — the AI will have very little to go on.'}
        </p>
        {existing && (
          <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ok">
            <Feather size={13} /> Written · {wordCount(existing.text).toLocaleString()} words. Pasting again saves a new version.
          </p>
        )}

        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-3">
            <Step n={1} done={copied} />
            <Button variant={copied ? 'secondary' : 'primary'} onClick={copyPrompt} className="flex-1 justify-center sm:flex-none">
              <Copy /> {followUp ? 'Copy follow-up prompt' : 'Copy prompt'}
            </Button>
            <a href={GROK_URL} target="_blank" rel="noreferrer" className="inline-flex h-8.5 items-center gap-1.5 rounded-lg px-3 text-[13px] text-muted hover:bg-surface-2 hover:text-ink">
              <ExternalLink size={14} /> Grok
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Step n={2} done={false} />
            <Button variant={copied ? 'primary' : 'secondary'} onClick={paste} className="flex-1 justify-center sm:flex-none">
              <ClipboardPaste /> Paste Grok’s reply
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onEditBeat(beat.id)}>
              <Pencil /> Edit
            </Button>
          </div>
        </div>
        {mode === 'same' && (
          <p className="mt-4 text-[12px] leading-snug text-faint">
            {chatStarted
              ? 'Paste the follow-up into the same Grok chat. If you edited the last passage here, switch to “New chat each” so Grok sees your version.'
              : 'The first prompt carries the full brief and starts the chat; the following beats get short follow-ups.'}
          </p>
        )}
      </div>

      {/* Whole chapter */}
      <div className="rounded-2xl border border-dashed border-line-strong p-5">
        <p className="flex items-center gap-2 font-medium text-ink">
          <Layers size={15} className="text-faint" /> Or write the whole chapter in one go
        </p>
        <p className="mt-1 text-[12.5px] text-muted">Faster, but long replies tend to be thinner per beat. Grok marks each beat with [[Beat N]], and pasting splits the reply back into beats.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={copyChapterPrompt}>
            <Copy /> Copy chapter prompt
          </Button>
          <Button onClick={() => setChapterPaste(true)}>
            <ClipboardPaste /> Paste chapter reply
          </Button>
        </div>
      </div>

      {chapterPaste && <ChapterPasteDialog beats={beats} prose={prose} onClose={() => setChapterPaste(false)} />}
    </div>
  )
}

function Step({ n, done }: { n: number; done: boolean }) {
  return (
    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold', done ? 'bg-ok text-white' : 'bg-surface-2 text-muted')}>
      {done ? <Check size={12} strokeWidth={3} /> : n}
    </span>
  )
}
