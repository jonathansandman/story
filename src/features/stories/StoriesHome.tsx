import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, Plus, Wand2 } from 'lucide-react'
import { db } from '@/db/db'
import { useCharacters, useStories } from '@/db/hooks'
import { createStory } from '@/db/repo'
import type { BeatStatus } from '@/db/types'
import { cn } from '@/lib/cn'
import { plural, relativeTime } from '@/lib/text'
import { AvatarStack, Button, EmptyState } from '@/components/ui/primitives'
import { Page, PageHeader } from '@/components/layout/Page'
import { BEAT_STATUS, BEAT_STATUSES, STORY_STATUS } from './status'

export function StoriesHome() {
  const stories = useStories()
  const characters = useCharacters()
  const navigate = useNavigate()
  const draft = (() => {
    try {
      const raw = localStorage.getItem('trellis.builder')
      return raw ? ((JSON.parse(raw) as { spark?: { text?: string } }).spark?.text ?? '').trim() : ''
    } catch {
      return ''
    }
  })()
  const stats = useLiveQuery(async () => {
    const [chapters, beats] = await Promise.all([db.chapters.toArray(), db.beats.toArray()])
    const m = new Map<string, { chapters: number; beats: Record<BeatStatus, number>; total: number }>()
    const get = (id: string) => {
      let s = m.get(id)
      if (!s) m.set(id, (s = { chapters: 0, beats: { idea: 0, planned: 0, ready: 0, written: 0 }, total: 0 }))
      return s
    }
    for (const c of chapters) get(c.storyId).chapters++
    for (const b of beats) {
      const s = get(b.storyId)
      s.beats[b.status]++
      s.total++
    }
    return m
  }, [])
  const byId = new Map((characters ?? []).map((c) => [c.id, c]))

  const create = async () => {
    const s = await createStory()
    navigate(`/stories/${s.id}/bible`)
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Trellis"
        title="Stories"
        description="Plan slowly, write once. Build the structure here — characters, chapters, beats — then hand each beat to your writing AI with exactly the context it needs."
        actions={
          <>
            <Button onClick={create}>
              <Plus /> Blank
            </Button>
            <Button variant="primary" onClick={() => navigate('/new')}>
              <Wand2 /> New story with AI
            </Button>
          </>
        }
      />

      {draft && (
        <button
          onClick={() => navigate('/new')}
          className="mb-6 flex w-full items-center gap-4 rounded-2xl border border-accent/30 bg-accent-soft/40 px-5 py-4 text-left transition-colors hover:border-accent/60"
        >
          <Wand2 size={18} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium text-ink">Continue your story in progress</span>
            <span className="block truncate font-serif text-[14px] text-muted">{draft}</span>
          </span>
          <span className="text-[13px] text-accent">Resume →</span>
        </button>
      )}

      {stories && stories.length === 0 && (
        <EmptyState icon={<BookOpen />} title="Your shelf is empty" action={<Button variant="primary" onClick={create}><Plus /> Start a story</Button>}>
          Begin with a title and a logline. You can leave everything else blank until you know it.
        </EmptyState>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {stories?.map((s) => {
          const st = stats?.get(s.id)
          const cast = s.cast.map((m) => byId.get(m.characterId)).filter((c): c is NonNullable<typeof c> => !!c)
          return (
            <Link
              key={s.id}
              to={`/stories/${s.id}`}
              className="group flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11.5px] text-muted">{STORY_STATUS[s.status]}</span>
                <span className="text-[11.5px] text-faint">{relativeTime(s.updatedAt)}</span>
              </div>
              <h2 className="mt-4 font-serif text-[24px] leading-tight tracking-tight text-ink">{s.title || 'Untitled story'}</h2>
              <p className="mt-2 line-clamp-3 flex-1 font-serif text-[15px] leading-snug text-muted">{s.logline || <span className="text-faint italic">No logline yet.</span>}</p>
              {st && st.total > 0 && (
                <div className="mt-5 flex h-1.5 overflow-hidden rounded-full bg-surface-2" title="Beats by status">
                  {BEAT_STATUSES.map((k) => (
                    <span key={k} className={cn(BEAT_STATUS[k].bar)} style={{ width: `${(st.beats[k] / st.total) * 100}%` }} />
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[12px] text-faint">
                  {plural(st?.chapters ?? 0, 'chapter')} · {plural(st?.total ?? 0, 'beat')}
                  {st && st.beats.ready + st.beats.written > 0 && ` · ${st.beats.ready} ready, ${st.beats.written} written`}
                </span>
                <AvatarStack people={cast} />
              </div>
            </Link>
          )
        })}
      </div>
    </Page>
  )
}
