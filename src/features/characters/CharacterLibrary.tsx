import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Plus, Search, Sparkles } from 'lucide-react'
import { useCharacters, useStories } from '@/db/hooks'
import { createCharacter } from '@/db/repo'
import { cn } from '@/lib/cn'
import { matches } from '@/lib/text'
import { Avatar, Button } from '@/components/ui/primitives'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/overlays'
import { LibraryScreen } from '@/components/layout/AppShell'
import { Scroll } from '@/components/layout/Screen'
import { useAi } from '@/features/ai/ai-context'

export function CharacterLibrary() {
  const characters = useCharacters()
  const stories = useStories()
  const navigate = useNavigate()
  const { openAi } = useAi()
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)

  const tags = useMemo(() => [...new Set((characters ?? []).flatMap((c) => c.tags))].sort(), [characters])
  const storyNames = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const s of stories ?? []) for (const c of s.cast) m.set(c.characterId, [...(m.get(c.characterId) ?? []), s.title || 'Untitled'])
    return m
  }, [stories])

  const list = (characters ?? []).filter(
    (c) => (!tag || c.tags.includes(tag)) && (!q || matches([c.name, c.aka, c.tagline, c.tags.join(' '), c.personality, c.desires].join(' '), q)),
  )

  const create = async () => navigate(`/characters/${(await createCharacter({ name: '' })).id}`)

  return (
    <LibraryScreen
      title="Characters"
      actions={
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="New character">
              <Plus />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={<Sparkles />} onSelect={() => openAi({ kind: 'new-character' })}>
              New character with AI
            </MenuItem>
            <MenuItem icon={<Plus />} onSelect={create}>
              Blank character
            </MenuItem>
          </MenuContent>
        </Menu>
      }
    >
      <Scroll>
        <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6">
          {(characters?.length ?? 0) > 4 && (
            <div className="relative mb-3">
              <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search characters"
                aria-label="Search characters"
                className="h-11 w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-[15px] outline-none focus:border-accent/60"
              />
            </div>
          )}
          {tags.length > 1 && (
            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
              {tags.map((t) => (
                <button
                  key={t}
                  aria-pressed={tag === t}
                  onClick={() => setTag(tag === t ? null : t)}
                  className={cn('h-9 shrink-0 rounded-full border px-3.5 text-[13.5px]', tag === t ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted')}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {characters && characters.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20">
              <Button variant="primary" onClick={() => openAi({ kind: 'new-character' })}>
                <Sparkles /> New character with AI
              </Button>
              <Button variant="ghost" onClick={create}>
                Start blank
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {list.map((c) => (
                <li key={c.id}>
                  <Link to={`/characters/${c.id}`} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-surface-2/60">
                    <Avatar name={c.name || '?'} color={c.color} size={42} className="ring-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-serif text-[18px] leading-tight">{c.name || 'Unnamed character'}</span>
                      <span className="block truncate text-[13.5px] text-muted">{c.tagline || [c.pronouns, c.age].filter(Boolean).join(' · ') || '—'}</span>
                      {storyNames.get(c.id) && <span className="block truncate text-[12px] text-faint">{storyNames.get(c.id)!.join(' · ')}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {characters && characters.length > 0 && list.length === 0 && <p className="py-10 text-center text-[14px] text-faint">No matches</p>}
        </div>
      </Scroll>
    </LibraryScreen>
  )
}
