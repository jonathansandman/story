import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, FileText, Layers, Search, User } from 'lucide-react'
import { db } from '@/db/db'
import { cn } from '@/lib/cn'
import { matches } from '@/lib/text'
import { Dialog } from '@/components/ui/overlays'

/**
 * ⌘K search across every entity. Searches the full text of each row (not just
 * titles) so "the rings" finds the beat where the rings come off.
 */

interface Result {
  id: string
  kind: 'story' | 'chapter' | 'beat' | 'character'
  title: string
  subtitle: string
  href: string
}

const ICONS = { story: BookOpen, chapter: Layers, beat: FileText, character: User }
const GROUP_LABEL = { character: 'Characters', story: 'Stories', chapter: 'Chapters', beat: 'Beats' }

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
    }
  }, [open])

  const data = useLiveQuery(async () => {
    if (!open) return null
    const [stories, chapters, beats, characters, drafts] = await Promise.all([
      db.stories.toArray(),
      db.chapters.toArray(),
      db.beats.toArray(),
      db.characters.toArray(),
      db.drafts.toArray(),
    ])
    // Only the active version of each beat's prose is searchable.
    const draftText = new Map(drafts.map((d) => [d.id, d.text]))
    const prose = new Map(beats.map((b) => [b.id, (b.activeDraftId && draftText.get(b.activeDraftId)) || '']))
    return { stories, chapters, beats, characters, prose }
  }, [open])

  const results = useMemo<Result[]>(() => {
    if (!data) return []
    const storyTitle = new Map(data.stories.map((s) => [s.id, s.title || 'Untitled story']))
    const chapterTitle = new Map(data.chapters.map((c) => [c.id, c.title || `Chapter ${c.order + 1}`]))
    const all: Array<Result & { hay: string }> = [
      ...data.characters.map((c) => ({
        id: c.id,
        kind: 'character' as const,
        title: c.name || 'Unnamed',
        subtitle: c.tagline,
        href: `/characters/${c.id}`,
        hay: [c.name, c.aka, c.tagline, c.tags.join(' '), c.personality, c.voice, c.desires, c.backstory].join(' '),
      })),
      ...data.stories.map((s) => ({
        id: s.id,
        kind: 'story' as const,
        title: s.title || 'Untitled story',
        subtitle: s.logline,
        href: `/stories/${s.id}`,
        hay: [s.title, s.logline, s.premise, s.genre, s.tags.join(' ')].join(' '),
      })),
      ...data.chapters.map((c) => ({
        id: c.id,
        kind: 'chapter' as const,
        title: c.title || `Chapter ${c.order + 1}`,
        subtitle: storyTitle.get(c.storyId) ?? '',
        href: `/stories/${c.storyId}?chapter=${c.id}`,
        hay: [c.title, c.purpose, c.summary, c.setting].join(' '),
      })),
      ...data.beats.map((b) => ({
        id: b.id,
        kind: 'beat' as const,
        title: b.title || b.description.slice(0, 60) || 'Untitled beat',
        subtitle: `${storyTitle.get(b.storyId) ?? ''} · ${chapterTitle.get(b.chapterId) ?? ''}`,
        href: `/stories/${b.storyId}?chapter=${b.chapterId}&beat=${b.id}`,
        hay: [b.title, b.description, b.emotion, b.tone, b.mustInclude, b.recap, data.prose.get(b.id) ?? ''].join(' '),
      })),
    ]
    const filtered = q.trim() ? all.filter((r) => matches(`${r.title} ${r.hay}`, q)) : all.filter((r) => r.kind !== 'beat')
    return filtered.slice(0, 40).map(({ hay: _hay, ...r }) => r)
  }, [data, q])

  useEffect(() => setActive(0), [q])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const go = (r: Result | undefined) => {
    if (!r) return
    onOpenChange(false)
    navigate(r.href)
  }

  let lastKind: Result['kind'] | null = null

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Search" hideHeader className="top-[14vh]! max-w-xl translate-y-0!">
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={16} className="text-faint" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') go(results[active])
          }}
          placeholder="Search characters, stories, beats, prose…"
          className="h-13 flex-1 bg-transparent text-[15px] outline-none max-sm:text-[16px]"
        />
      </div>
      <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
        {results.length === 0 && <p className="px-3 py-8 text-center text-[13px] text-faint">Nothing matches “{q}”.</p>}
        {results.map((r, i) => {
          const Icon = ICONS[r.kind]
          const header = r.kind !== lastKind ? GROUP_LABEL[r.kind] : null
          lastKind = r.kind
          return (
            <div key={`${r.kind}-${r.id}`}>
              {header && <div className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">{header}</div>}
              <button
                data-index={i}
                onMouseMove={() => setActive(i)}
                onClick={() => go(r)}
                className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left', i === active && 'bg-surface-2')}
              >
                <Icon size={15} className="shrink-0 text-faint" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-ink">{r.title}</span>
                  {r.subtitle && <span className="block truncate text-[12px] text-faint">{r.subtitle}</span>}
                </span>
              </button>
            </div>
          )
        })}
      </div>
    </Dialog>
  )
}
