import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ClipboardPaste, Copy, ExternalLink, Layers } from 'lucide-react'
import { db } from '@/db/db'
import { loadBundle } from '@/db/hooks'
import { addDraft, deleteDraft } from '@/db/repo'
import { buildFollowUp, buildPrompt } from '@/export/build'
import { render } from '@/export/render'
import { stripMarkers } from '@/export/split'
import { copyText, readClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { estimateTokens, wordCount } from '@/lib/text'
import { Button, Segmented } from '@/components/ui/primitives'
import { Sheet, useToast } from '@/components/ui/overlays'
import { Scroll } from '@/components/layout/Screen'
import { GROK_URL } from '@/features/ai/SendStep'
import { optionsFor } from '@/features/export/composer-context'
import { ChapterPasteDialog } from '@/features/stories/ChapterPasteDialog'
import { BEAT_STATUS } from '@/features/stories/status'
import { useBeatParam, useStoryCtx } from './StoryShell'

type ChatMode = 'same' | 'new'
const MODE_KEY = 'trellis.writeChatMode'

/**
 * The writing loop as its own screen: copy → Grok → paste → next beat.
 * Both actions sit under the thumb; the last save is previewed with Undo so
 * a wrong clipboard is caught immediately.
 */
export function WriteTab() {
  const { story, chapter, beats, prose } = useStoryCtx()
  const toast = useToast()
  const { open: openBeat } = useBeatParam()
  const list = chapter ? (beats.get(chapter.id) ?? []) : []
  const [index, setIndex] = useState(() => Math.max(0, list.findIndex((b) => !prose.has(b.id))))
  const [mode, setMode] = useState<ChatMode>(() => {
    try {
      return (localStorage.getItem(MODE_KEY) as ChatMode | null) ?? 'same'
    } catch {
      return 'same'
    }
  })
  const [chatStarted, setChatStarted] = useState(false)
  const [copied, setCopied] = useState(false)
  const [lastSave, setLastSave] = useState<{ beatIndex: number; draftId: string; text: string } | null>(null)
  const [wholeChapter, setWholeChapter] = useState(false)
  const [pasteChapter, setPasteChapter] = useState(false)

  useEffect(() => {
    setIndex(Math.max(0, list.findIndex((b) => !prose.has(b.id))))
    setChatStarted(false)
    setLastSave(null)
    // Only when the chapter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.id])
  useEffect(() => setCopied(false), [index])
  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode)
    } catch {
      /* ignore */
    }
  }, [mode])

  const beat = list[index]
  if (!chapter || !beat)
    return <div className="flex h-full items-center justify-center px-6 text-[15px] text-faint">{chapter ? 'No beats in this chapter yet.' : 'No chapters yet.'}</div>

  const followUp = mode === 'same' && chatStarted
  const existing = prose.get(beat.id)

  const copy = async () => {
    const bundle = await loadBundle(story.id)
    if (!bundle) return
    const options = optionsFor(bundle.story)
    const { doc } = followUp ? buildFollowUp(bundle, beat.id, options) : buildPrompt({ bundle, scope: { kind: 'beat', beatId: beat.id }, options })
    const out = render(doc, options.format)
    await copyText(out)
    setCopied(true)
    if (mode === 'same') setChatStarted(true)
    toast(followUp ? 'Follow-up copied' : 'Prompt copied', `~${estimateTokens(out).toLocaleString()} tokens`)
  }

  const paste = async () => {
    const raw = await readClipboard()
    const text = raw ? stripMarkers(raw) : ''
    if (!text) return toast('Clipboard is empty')
    const draft = await addDraft(beat.id, text)
    if (!draft) return
    setLastSave({ beatIndex: index, draftId: draft.id, text })
    const next = list.findIndex((b, i) => i > index && !prose.has(b.id))
    if (next >= 0) setIndex(next)
    else if (index < list.length - 1) setIndex(index + 1)
  }

  const copyChapter = async () => {
    const bundle = await loadBundle(story.id)
    if (!bundle) return
    const options = optionsFor(bundle.story)
    const out = render(buildPrompt({ bundle, scope: { kind: 'chapter', chapterId: chapter.id }, options }).doc, options.format)
    await copyText(out)
    toast('Chapter prompt copied', `~${estimateTokens(out).toLocaleString()} tokens`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Scroll>
        <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <Segmented<ChatMode>
              size="sm"
              value={mode}
              onChange={(m) => {
                setMode(m)
                setChatStarted(false)
              }}
              options={[
                { value: 'same', label: 'One chat', title: 'Full brief once, then short follow-ups in the same Grok chat' },
                { value: 'new', label: 'Fresh chats', title: 'Full brief every time' },
              ]}
            />

          </div>

          <div className="flex gap-1" role="tablist" aria-label="Beats">
            {list.map((b, i) => (
              <button
                key={b.id}
                role="tab"
                aria-selected={i === index}
                aria-label={`Beat ${i + 1}${prose.has(b.id) ? ', written' : ''}`}
                onClick={() => setIndex(i)}
                className="flex h-8 flex-1 items-center"
              >
                <span className={cn('h-2 w-full rounded-full', prose.has(b.id) ? 'bg-ok' : BEAT_STATUS[b.status].bar, i === index && 'ring-2 ring-accent ring-offset-2 ring-offset-bg')} />
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center gap-1">
              <p className="flex-1 text-[12px] font-semibold tracking-[0.08em] text-faint uppercase">
                Beat {index + 1} of {list.length}
                {beat.targetWords ? ` · ~${beat.targetWords.toLocaleString()} words` : ''}
              </p>
              <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Previous beat">
                <ChevronLeft />
              </Button>
              <Button variant="ghost" size="icon-sm" disabled={index === list.length - 1} onClick={() => setIndex(index + 1)} aria-label="Next beat">
                <ChevronRight />
              </Button>
            </div>
            <button onClick={() => openBeat(beat.id)} className="mt-1 block text-left">
              <h2 className="font-serif text-[23px] leading-snug">{beat.title || 'Untitled beat'}</h2>
              <p className={cn('mt-1.5 text-[15px] leading-relaxed', beat.description ? 'text-muted' : 'text-faint')}>{beat.description || 'No plan yet'}</p>
            </button>
            {existing && <p className="mt-3 text-[13px] text-ok">{wordCount(existing.text).toLocaleString()} words written · pasting adds a new version</p>}
          </div>

          <button onClick={() => setWholeChapter(true)} className="flex h-10 items-center gap-2 text-[14px] text-muted hover:text-ink">
            <Layers size={16} /> Write the whole chapter at once
          </button>

          {lastSave && (
            <div className="rounded-2xl bg-surface-2/70 p-4">
              <div className="flex items-center gap-2">
                <p className="flex-1 text-[13px] font-medium">
                  Saved to beat {lastSave.beatIndex + 1} · {wordCount(lastSave.text).toLocaleString()} words
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const d = await db.drafts.get(lastSave.draftId)
                    if (d) await deleteDraft(d.id)
                    setIndex(lastSave.beatIndex)
                    setLastSave(null)
                  }}
                >
                  Undo
                </Button>
              </div>
              <p className="mt-1 line-clamp-3 font-serif text-[14.5px] text-muted italic">{lastSave.text.slice(0, 400)}</p>
            </div>
          )}
        </div>
      </Scroll>

      <div className="shrink-0 border-t border-line bg-surface px-3 pt-3 pb-3">
        <div className="mx-auto flex max-w-xl gap-2">
          <Button variant={copied ? 'secondary' : 'primary'} className="flex-1 justify-center" onClick={copy}>
            <Copy /> {followUp ? 'Copy follow-up' : 'Copy prompt'}
          </Button>
          <a href={GROK_URL} target="_blank" rel="noreferrer" aria-label="Open Grok" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line text-muted lg:h-8.5 lg:w-8.5">
            <ExternalLink size={17} />
          </a>
          <Button variant={copied ? 'primary' : 'secondary'} className="flex-1 justify-center" onClick={paste}>
            <ClipboardPaste /> Paste reply
          </Button>
        </div>
      </div>

      <Sheet open={wholeChapter} onOpenChange={setWholeChapter} title="Whole chapter">
        <div className="space-y-2 p-4">
          <Button className="w-full justify-center" onClick={copyChapter}>
            <Copy /> Copy chapter prompt
          </Button>
          <Button
            className="w-full justify-center"
            onClick={() => {
              setWholeChapter(false)
              setPasteChapter(true)
            }}
          >
            <ClipboardPaste /> Paste chapter reply
          </Button>
        </div>
      </Sheet>
      {pasteChapter && <ChapterPasteDialog beats={list} prose={prose} onClose={() => setPasteChapter(false)} />}
    </div>
  )
}
