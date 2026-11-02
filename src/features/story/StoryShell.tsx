import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { BookOpen, ChevronDown, ChevronLeft, ClipboardList, Feather, Glasses, Layers, Lightbulb, MoreHorizontal, Plus, Search, Sparkles, Trash2, UserPlus, Wand2 } from 'lucide-react'
import { useChapters, useStories, useStory, useStoryBeats, useStoryProse } from '@/db/hooks'
import { createChapter, deleteStory } from '@/db/repo'
import { useLastSaved } from '@/db/saved'
import type { Beat, Chapter, Draft, Story } from '@/db/types'
import { cn } from '@/lib/cn'
import { saveLastVisit, type LastVisit } from '@/lib/lastVisit'
import { Button } from '@/components/ui/primitives'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, useConfirm } from '@/components/ui/overlays'
import { BottomTabs, Screen, TopBar, TopTabs, type TabItem } from '@/components/layout/Screen'
import { useOpenSearch } from '@/components/layout/AppShell'
import { AssistantButton, PendingBanner, type AssistantAction } from '@/features/ai/Assistant'
import { useAi } from '@/features/ai/ai-context'
import { useComposer } from '@/features/export/composer-context'

/* ───────────── Context shared by the story tabs ───────────── */

export interface StoryCtx {
  story: Story
  chapters: Chapter[]
  beats: Map<string, Beat[]>
  prose: Map<string, Draft>
  chapter: Chapter | undefined
  selectChapter: (id: string) => void
}

const Ctx = createContext<StoryCtx | null>(null)
export function useStoryCtx(): StoryCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStoryCtx outside StoryShell')
  return v
}

type Tab = LastVisit['tab']
const tabFromPath = (path: string): Tab => {
  const seg = path.split('/')[3]
  return seg === 'write' || seg === 'read' || seg === 'ideas' || seg === 'story' ? seg : 'outline'
}

export function StoryShell() {
  const { storyId } = useParams()
  const story = useStory(storyId)
  const chapters = useChapters(storyId)
  const beats = useStoryBeats(storyId)
  const prose = useStoryProse(storyId)
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const tab = tabFromPath(location.pathname)

  const chapter = useMemo(() => {
    if (!chapters) return undefined
    return chapters.find((c) => c.id === params.get('chapter')) ?? chapters[0]
  }, [chapters, params])

  // Remember where we were, for "Continue" on the home screen.
  useEffect(() => {
    if (storyId) saveLastVisit({ storyId, chapterId: chapter?.id ?? null, tab })
  }, [storyId, chapter?.id, tab])

  if (story === null) return <div className="p-10 text-muted">Story not found.</div>
  if (!story || !chapters || !beats || !prose) return null

  const selectChapter = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('chapter', id)
    next.delete('beat')
    setParams(next, { replace: true })
  }

  const ctx: StoryCtx = { story, chapters, beats, prose, chapter, selectChapter }
  const q = chapter ? `?chapter=${chapter.id}` : ''
  const base = `/stories/${story.id}`
  const written = chapter ? (beats.get(chapter.id) ?? []).filter((b) => prose.has(b.id)).length : 0
  const tabs: TabItem[] = [
    { to: `${base}${q}`, label: 'Outline', icon: <ClipboardList />, end: true },
    { to: `${base}/write${q}`, label: 'Write', icon: <Feather /> },
    { to: `${base}/read${q}`, label: 'Read', icon: <Glasses /> },
    { to: `${base}/ideas${q}`, label: 'Ideas', icon: <Lightbulb />, badge: story.ideas?.length ?? 0 },
    { to: `${base}/story${q}`, label: 'Story', icon: <BookOpen /> },
  ]
  const showStrip = tab === 'write' || tab === 'read' || tab === 'outline'

  return (
    <Ctx.Provider value={ctx}>
      <Screen
        top={<StoryTopBar story={story} tabs={tabs} chapter={chapter} hasProse={written > 0} />}
        sub={
          <>
            <PendingBanner />
            {showStrip && <ChapterStrip className={tab === 'outline' ? 'lg:hidden' : ''} />}
          </>
        }
        bottom={<BottomTabs items={tabs} />}
      >
        <Outlet />
      </Screen>
    </Ctx.Provider>
  )
}

/* ───────────── Top bar ───────────── */

function StoryTopBar({ story, tabs, chapter, hasProse }: { story: Story; tabs: TabItem[]; chapter: Chapter | undefined; hasProse: boolean }) {
  const stories = useStories()
  const navigate = useNavigate()
  const openSearch = useOpenSearch()
  const { openAi } = useAi()
  const { openComposer } = useComposer()
  const { confirm, element } = useConfirm()
  const [params] = useSearchParams()
  const beatId = params.get('beat')

  const ai: AssistantAction[] = [
    ...(beatId ? [{ icon: <Wand2 />, label: 'Refine this beat', run: () => openAi({ kind: 'beat', beatId }) }] : []),
    ...(chapter
      ? [
          { icon: <Lightbulb />, label: 'Brainstorm beats', detail: chapter.title || `Chapter ${chapter.order + 1}`, run: () => openAi({ kind: 'brainstorm', chapterId: chapter.id }) },
          { icon: <Wand2 />, label: 'Edit chapter with AI', detail: chapter.title || undefined, run: () => openAi({ kind: 'chapter', chapterId: chapter.id }) },
        ]
      : [{ icon: <Layers />, label: 'Outline with AI', run: () => navigate(`/new?story=${story.id}`) }]),
    {
      icon: <Sparkles />,
      label: story.ideas?.length ? `Weave in ${story.ideas.length} idea${story.ideas.length === 1 ? '' : 's'}` : 'Weave an idea in',
      run: () => openAi({ kind: 'weave', storyId: story.id }),
    },
    ...(chapter && hasProse ? [{ icon: <Feather />, label: 'Polish chapter prose', run: () => navigate(`/stories/${story.id}/read?chapter=${chapter.id}&polish=1`) }] : []),
    { icon: <BookOpen />, label: 'Edit story with AI', run: () => openAi({ kind: 'story', storyId: story.id }) },
    { icon: <UserPlus />, label: 'New character with AI', run: () => openAi({ kind: 'new-character', storyId: story.id }) },
  ]

  return (
    <>
      <TopBar
        left={
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="All stories">
            <ChevronLeft />
          </Button>
        }
        title={
          <div className="flex min-w-0 items-center gap-4">
            <Menu>
              <MenuTrigger asChild>
                <button className="flex min-w-0 items-center gap-1 rounded-lg py-1 text-left" aria-label="Switch story">
                  <span className="truncate font-serif text-[19px] leading-tight lg:text-[20px]">{story.title || 'Untitled story'}</span>
                  <ChevronDown size={16} className="shrink-0 text-faint" />
                </button>
              </MenuTrigger>
              <MenuContent align="start">
                <MenuLabel>Stories</MenuLabel>
                {stories?.map((s) => (
                  <MenuItem key={s.id} checked={s.id === story.id} onSelect={() => navigate(`/stories/${s.id}`)}>
                    {s.title || 'Untitled story'}
                  </MenuItem>
                ))}
                <MenuSeparator />
                <MenuItem icon={<Plus />} onSelect={() => navigate('/new')}>
                  New story
                </MenuItem>
              </MenuContent>
            </Menu>
            <TopTabs items={tabs} />
          </div>
        }
        right={
          <>
            <SavedDot />
            <AssistantButton actions={ai} />
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Story menu">
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={<Search />} onSelect={openSearch}>
                  Search
                </MenuItem>
                {chapter && (
                  <MenuItem icon={<ClipboardList />} onSelect={() => openComposer(story.id, { kind: 'chapter', chapterId: chapter.id })}>
                    Chapter prompt options
                  </MenuItem>
                )}
                <MenuItem icon={<Layers />} onSelect={() => navigate(`/new?story=${story.id}`)}>
                  Outline with AI
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  danger
                  icon={<Trash2 />}
                  onSelect={async () => {
                    if (await confirm(`Delete “${story.title || 'Untitled story'}”?`, { body: 'Chapters, beats and prose are deleted. Characters stay in your library.' })) {
                      await deleteStory(story.id)
                      navigate('/')
                    }
                  }}
                >
                  Delete story
                </MenuItem>
              </MenuContent>
            </Menu>
          </>
        }
      />
      {element}
    </>
  )
}

/** Quiet confirmation that autosave happened. */
function SavedDot() {
  const last = useLastSaved()
  const recent = last > 0 && Date.now() - last < 2500
  return (
    <span aria-live="polite" className={cn('mr-1 text-[12px] text-faint transition-opacity duration-500', recent ? 'opacity-100' : 'opacity-0')}>
      Saved
    </span>
  )
}

/* ───────────── Chapter strip ───────────── */

export function ChapterStrip({ className }: { className?: string }) {
  const { story, chapters, chapter, beats, prose, selectChapter } = useStoryCtx()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [chapter?.id])
  return (
    <div ref={ref} className={cn('flex shrink-0 gap-1.5 overflow-x-auto border-b border-line px-3 py-2 [scrollbar-width:none]', className)}>
      {chapters.map((c, i) => {
        const list = beats.get(c.id) ?? []
        const done = list.filter((b) => prose.has(b.id)).length
        const on = c.id === chapter?.id
        return (
          <button
            key={c.id}
            aria-current={on}
            onClick={() => selectChapter(c.id)}
            className={cn(
              'flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13.5px] transition-colors',
              on ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-muted hover:border-line-strong',
            )}
          >
            <span className="tabular-nums opacity-60">{i + 1}</span>
            <span className="max-w-[11rem] truncate">{c.title || 'Untitled'}</span>
            {list.length > 0 && <span className={cn('text-[11.5px] tabular-nums', on ? 'opacity-70' : 'text-faint')}>{done}/{list.length}</span>}
          </button>
        )
      })}
      <button
        onClick={async () => selectChapter((await createChapter(story.id)).id)}
        aria-label="Add chapter"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-faint hover:text-ink"
      >
        <Plus size={16} />
      </button>
    </div>
  )
}

export function useBeatParam() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const beatId = params.get('beat')
  const open = (id: string, { replace = false }: { replace?: boolean } = {}) => {
    const next = new URLSearchParams(params)
    next.set('beat', id)
    setParams(next, { replace, state: replace ? location.state : { beatPushed: true } })
  }
  const close = () => {
    if ((location.state as { beatPushed?: boolean } | null)?.beatPushed) navigate(-1)
    else {
      const next = new URLSearchParams(params)
      next.delete('beat')
      setParams(next, { replace: true })
    }
  }
  return { beatId, open, close }
}
