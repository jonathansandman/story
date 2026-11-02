import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowRight, Copy, Wand2 } from 'lucide-react'
import { copyText } from '@/lib/clipboard'
import { findRepeats } from '@/lib/repeats'
import { wordCount } from '@/lib/text'
import { Button } from '@/components/ui/primitives'
import { Sheet, useToast } from '@/components/ui/overlays'
import { Scroll } from '@/components/layout/Screen'
import { ChapterPasteDialog } from '@/features/stories/ChapterPasteDialog'
import { PolishBox, RepeatsNote } from '@/features/stories/PolishTools'
import { useBeatParam, useStoryCtx } from './StoryShell'

/** The chapter as a book page. Tools stay small and out of the way. */
export function ReadTab() {
  const { chapters, chapter, beats, prose, selectChapter } = useStoryCtx()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const { open: openBeat } = useBeatParam()
  const [pastePolish, setPastePolish] = useState(false)
  const list = chapter ? (beats.get(chapter.id) ?? []) : []
  const written = list.filter((b) => prose.has(b.id))
  const fullText = written.map((b) => prose.get(b.id)!.text.trim()).join('\n\n')
  const repeats = useMemo(() => findRepeats(fullText, { min: 4 }), [fullText])
  const polishOpen = params.get('polish') === '1'
  const setPolish = (on: boolean) => {
    const next = new URLSearchParams(params)
    if (on) next.set('polish', '1')
    else next.delete('polish')
    setParams(next, { replace: !on })
  }
  if (!chapter) return null
  const i = chapters.indexOf(chapter)
  const nextChapter = chapters[i + 1]

  return (
    <>
      <Scroll>
        <div className="mx-auto w-full max-w-[40rem] px-5 pt-5 pb-16">
          <div className="mb-6 flex items-center gap-1">
            <p className="flex-1 text-[13px] text-faint tabular-nums">
              {written.length}/{list.length} beats · {wordCount(fullText).toLocaleString()} words
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled={!fullText}
              onClick={async () => {
                await copyText(`${chapter.title ? `${chapter.title}\n\n` : ''}${fullText}\n`)
                toast('Chapter copied', `${wordCount(fullText).toLocaleString()} words`)
              }}
            >
              <Copy /> Copy
            </Button>
            <Button size="sm" variant="ghost" disabled={!fullText} onClick={() => setPolish(true)}>
              <Wand2 /> Polish{repeats.length ? <span className="rounded-full bg-warn/15 px-1.5 text-[11px] text-warn">{repeats.length}</span> : null}
            </Button>
          </div>

          <h1 className="mb-8 font-serif text-[30px] leading-tight">{chapter.title || `Chapter ${i + 1}`}</h1>
          <article className="font-serif text-[18.5px] leading-[1.8] text-ink">
            {list.map((b, n) => {
              const d = prose.get(b.id)
              return d ? (
                <section key={b.id} className="mb-6">
                  {d.text
                    .trim()
                    .split(/\n\s*\n/)
                    .map((para, j) => (
                      <p key={j} className="mb-4 whitespace-pre-line">
                        {para}
                      </p>
                    ))}
                </section>
              ) : (
                <button key={b.id} onClick={() => openBeat(b.id)} className="mb-6 block w-full rounded-xl border border-dashed border-line-strong px-4 py-3 text-left font-sans text-[14px] text-faint hover:border-accent/50">
                  {n + 1}. {b.title || 'Untitled beat'} — not written
                </button>
              )
            })}
          </article>

          {nextChapter && (
            <button onClick={() => selectChapter(nextChapter.id)} className="mt-10 flex w-full items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 text-left hover:border-line-strong">
              <span>
                <span className="block text-[12px] font-semibold tracking-[0.08em] text-faint uppercase">Next chapter</span>
                <span className="block font-serif text-[19px]">{nextChapter.title || `Chapter ${i + 2}`}</span>
              </span>
              <ArrowRight size={20} className="text-faint" />
            </button>
          )}
        </div>
      </Scroll>

      <Sheet open={polishOpen} onOpenChange={setPolish} title="Polish chapter">
        <div className="space-y-3 overflow-y-auto p-4">
          <RepeatsNote text={fullText} min={4} />
          <PolishBox
            defaultOpen
            storyId={chapter.storyId}
            beatIds={written.map((b) => b.id)}
            label="chapter"
            onPaste={() => {
              setPolish(false)
              setPastePolish(true)
            }}
          />
        </div>
      </Sheet>
      {pastePolish && <ChapterPasteDialog beats={list} prose={prose} polish onClose={() => setPastePolish(false)} />}
    </>
  )
}
