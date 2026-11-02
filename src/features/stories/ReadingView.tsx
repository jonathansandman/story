import { Copy } from 'lucide-react'
import type { Beat, Chapter, Draft } from '@/db/types'
import { copyText } from '@/lib/clipboard'
import { wordCount } from '@/lib/text'
import { Button } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/overlays'

/**
 * The chapter as prose: every beat's active draft in order, with quiet beat
 * markers in the margin. Unwritten beats show their plan so gaps are obvious.
 * Designed to be comfortable to read on a phone.
 */
export function ReadingView({ chapter, beats, prose }: { chapter: Chapter; beats: Beat[]; prose: Map<string, Draft> }) {
  const toast = useToast()
  const written = beats.filter((b) => prose.has(b.id))
  const fullText = written.map((b) => prose.get(b.id)!.text.trim()).join('\n\n')

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] text-faint">
          {written.length} of {beats.length} beats written · {wordCount(fullText).toLocaleString()} words
        </span>
        <Button
          size="sm"
          disabled={!fullText}
          onClick={async () => {
            await copyText(`${chapter.title ? `${chapter.title}\n\n` : ''}${fullText}\n`)
            toast('Chapter text copied', `${wordCount(fullText).toLocaleString()} words`)
          }}
        >
          <Copy /> Copy chapter text
        </Button>
      </div>

      <article className="mx-auto max-w-[38rem] font-serif text-[18px] leading-[1.8] text-ink">
        {beats.map((b, i) => {
          const d = prose.get(b.id)
          return (
            <section key={b.id} className="relative mb-8">
              <div className="mb-2 font-sans text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">
                {String(i + 1).padStart(2, '0')} · {b.title || 'Untitled beat'}
              </div>
              {d ? (
                d.text
                  .trim()
                  .split(/\n\s*\n/)
                  .map((para, j) => (
                    <p key={j} className="mb-4 whitespace-pre-line">
                      {para}
                    </p>
                  ))
              ) : (
                <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 font-sans text-[13.5px] leading-relaxed text-faint">
                  Not written yet{b.description ? ` — ${b.description}` : '.'}
                </p>
              )}
            </section>
          )
        })}
      </article>
    </div>
  )
}
