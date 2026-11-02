import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, BookOpen, Plus, Wand2 } from 'lucide-react'
import { db } from '@/db/db'
import { useCharacters, useStories } from '@/db/hooks'
import { createStory } from '@/db/repo'
import type { BeatStatus } from '@/db/types'
import { loadLastVisit, tabPath } from '@/lib/lastVisit'
import { plural, relativeTime } from '@/lib/text'
import { AvatarStack, Button } from '@/components/ui/primitives'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/overlays'
import { LibraryScreen } from '@/components/layout/AppShell'
import { Scroll } from '@/components/layout/Screen'
import { STORY_STATUS } from './status'

export function StoriesHome() {
  const stories = useStories()
  const characters = useCharacters()
  const navigate = useNavigate()
  const last = loadLastVisit()
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
  const lastChapter = useLiveQuery(async () => (last?.chapterId ? ((await db.chapters.get(last.chapterId)) ?? null) : null), [last?.chapterId])
  const byId = new Map((characters ?? []).map((c) => [c.id, c]))
  const lastStory = last ? stories?.find((s) => s.id === last.storyId) : undefined

  const blank = async () => {
    const s = await createStory()
    navigate(`/stories/${s.id}/story`)
  }

  return (
    <LibraryScreen
      title="Stories"
      actions={
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="New story">
              <Plus />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={<Wand2 />} onSelect={() => navigate('/new')}>
              New story with AI
            </MenuItem>
            <MenuItem icon={<Plus />} onSelect={blank}>
              Blank story
            </MenuItem>
          </MenuContent>
        </Menu>
      }
    >
      <Scroll>
        <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-4 sm:px-6 lg:py-8">
          {lastStory && (
            <Link
              to={`${tabPath(lastStory.id, last!.tab)}${last!.chapterId ? `?chapter=${last!.chapterId}` : ''}`}
              className="flex items-center gap-4 rounded-2xl bg-ink px-5 py-4 text-bg transition-opacity hover:opacity-95"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold tracking-[0.08em] uppercase opacity-60">Continue</span>
                <span className="block truncate font-serif text-[20px] leading-snug">{lastStory.title || 'Untitled story'}</span>
                {lastChapter && <span className="block truncate text-[13.5px] opacity-70">{lastChapter.title || `Chapter ${lastChapter.order + 1}`} · {last!.tab === 'outline' ? 'Outline' : last!.tab[0]!.toUpperCase() + last!.tab.slice(1)}</span>}
              </span>
              <ArrowRight size={20} className="shrink-0 opacity-70" />
            </Link>
          )}

          {draft && (
            <Link to="/new" className="flex items-center gap-3 rounded-2xl border border-dashed border-accent/40 px-5 py-4 transition-colors hover:border-accent">
              <Wand2 size={18} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold tracking-[0.08em] text-accent uppercase">Draft</span>
                <span className="block truncate font-serif text-[16px]">{draft}</span>
              </span>
            </Link>
          )}

          {stories && stories.length === 0 && !draft && (
            <div className="flex flex-col items-center gap-3 py-20">
              <BookOpen size={28} className="text-faint" />
              <Button variant="primary" onClick={() => navigate('/new')}>
                <Wand2 /> New story with AI
              </Button>
              <Button variant="ghost" onClick={blank}>
                Start blank
              </Button>
            </div>
          )}

          {!!stories?.length && (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {stories?.map((s) => {
              const st = stats?.get(s.id)
              const cast = s.cast.map((m) => byId.get(m.characterId)).filter((c): c is NonNullable<typeof c> => !!c)
              return (
                <li key={s.id}>
                  <Link to={`/stories/${s.id}`} className="block px-5 py-4 transition-colors hover:bg-surface-2/60">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate font-serif text-[19px] leading-snug">{s.title || 'Untitled story'}</h2>
                        {s.logline && <p className="mt-0.5 line-clamp-2 text-[14px] text-muted">{s.logline}</p>}
                      </div>
                      <AvatarStack people={cast} size={24} />
                    </div>
                    <p className="mt-2 text-[12.5px] text-faint">
                      {STORY_STATUS[s.status]} · {plural(st?.chapters ?? 0, 'chapter')} · {st?.beats.written ?? 0}/{st?.total ?? 0} beats written · {relativeTime(s.updatedAt)}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
          )}
        </div>
      </Scroll>
    </LibraryScreen>
  )
}
