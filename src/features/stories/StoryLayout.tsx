import { NavLink, Outlet, useNavigate, useParams } from 'react-router'
import { MoreHorizontal, Trash2, Wand2 } from 'lucide-react'
import { useAi } from '@/features/ai/ai-context'
import { useStory } from '@/db/hooks'
import { deleteStory, updateStory } from '@/db/repo'
import type { Story, StoryStatus } from '@/db/types'
import { cn } from '@/lib/cn'
import { Button, EmptyState, Select, TextInput } from '@/components/ui/primitives'
import { Menu, MenuContent, MenuItem, MenuTrigger, useConfirm } from '@/components/ui/overlays'
import { STORY_STATUS } from './status'

export interface StoryOutletContext {
  story: Story
}

export function StoryLayout() {
  const { storyId } = useParams()
  const story = useStory(storyId)
  const navigate = useNavigate()
  const { confirm, element } = useConfirm()
  const { openAi } = useAi()

  if (story === undefined) return null
  if (story === null)
    return (
      <div className="p-12">
        <EmptyState title="Story not found" />
      </div>
    )

  const tab = (to: string, label: string, end = false) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'relative -mb-px border-b-2 px-1 pb-2.5 text-[13.5px] transition-colors',
          isActive ? 'border-accent font-medium text-ink' : 'border-transparent text-muted hover:text-ink',
        )
      }
    >
      {label}
    </NavLink>
  )

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-bg/80 px-4 pt-6 backdrop-blur sm:px-8 lg:pt-8">
        <div className="mx-auto flex max-w-[1400px] items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <TextInput
              key={story.id}
              variant="quiet"
              value={story.title}
              onCommit={(title) => updateStory(story.id, { title })}
              placeholder="Untitled story"
              className="font-serif text-[28px] leading-tight tracking-tight"
              aria-label="Story title"
            />
            {story.logline && <p className="mt-0.5 line-clamp-1 max-w-3xl text-[13.5px] text-muted">{story.logline}</p>}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Select<StoryStatus>
              aria-label="Status"
              value={story.status}
              onChange={(status) => updateStory(story.id, { status })}
              options={Object.entries(STORY_STATUS).map(([value, label]) => ({ value: value as StoryStatus, label }))}
              className="h-8 w-34 text-[13px] max-sm:hidden"
            />
            <Button size="sm" aria-label="Edit story with AI" title="Edit story with AI" onClick={() => openAi({ kind: 'story', storyId: story.id })}>
              <Wand2 /> <span className="max-sm:hidden">Edit with AI</span>
            </Button>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Story menu">
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem
                  danger
                  icon={<Trash2 />}
                  onSelect={async () => {
                    if (await confirm(`Delete “${story.title || 'Untitled story'}”?`, { body: 'All chapters and beats will be deleted. Characters stay in your library.' })) {
                      await deleteStory(story.id)
                      navigate('/')
                    }
                  }}
                >
                  Delete story
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </div>
        <nav className="mx-auto mt-5 flex max-w-[1400px] gap-6">
          {tab(`/stories/${story.id}`, 'Outline', true)}
          {tab(`/stories/${story.id}/bible`, 'Story bible')}
          {tab(`/stories/${story.id}/cast`, 'Cast & dynamics')}
        </nav>
      </header>
      <Outlet context={{ story } satisfies StoryOutletContext} />
      {element}
    </div>
  )
}
