import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Plus, Search, Users, Wand2 } from 'lucide-react'
import { useAi } from '@/features/ai/ai-context'
import { useCharacters, useStories } from '@/db/hooks'
import { createCharacter } from '@/db/repo'
import { cn } from '@/lib/cn'
import { matches, plural } from '@/lib/text'
import { Avatar, Button, Chip, EmptyState } from '@/components/ui/primitives'
import { PageHeader, Page } from '@/components/layout/Page'

export function CharacterLibrary() {
  const characters = useCharacters()
  const stories = useStories()
  const navigate = useNavigate()
  const { openAi } = useAi()
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)

  const tags = useMemo(() => [...new Set((characters ?? []).flatMap((c) => c.tags))].sort(), [characters])
  const appearances = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of stories ?? []) for (const c of s.cast) m.set(c.characterId, (m.get(c.characterId) ?? 0) + 1)
    return m
  }, [stories])

  const list = (characters ?? []).filter(
    (c) =>
      (!tag || c.tags.includes(tag)) &&
      (!q || matches([c.name, c.aka, c.tagline, c.tags.join(' '), c.personality, c.desires].join(' '), q)),
  )

  const create = async () => {
    const c = await createCharacter({ name: '' })
    navigate(`/characters/${c.id}`)
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Library"
        title="Characters"
        description="Write them once, deeply. Every story can draw on the same people."
        actions={
          <>
            <Button onClick={create}>
              <Plus /> Blank
            </Button>
            <Button variant="primary" onClick={() => openAi({ kind: 'new-character' })}>
              <Wand2 /> New with AI
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search names, traits, desires…"
            className="h-8.5 w-full rounded-lg border border-line bg-surface pr-3 pl-8.5 text-[13px] outline-none max-sm:text-[16px] focus:border-accent/60"
          />
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <button key={t} onClick={() => setTag(tag === t ? null : t)}>
                <Chip className={cn('cursor-pointer transition-colors', tag === t ? 'bg-accent text-accent-ink' : 'hover:bg-surface-3')}>{t}</Chip>
              </button>
            ))}
          </div>
        )}
      </div>

      {characters && characters.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No characters yet"
          action={
            <Button variant="primary" onClick={create}>
              <Plus /> Create your first character
            </Button>
          }
        >
          Start with a name and a single line about who they are. Depth comes later.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <Link
              key={c.id}
              to={`/characters/${c.id}`}
              className="group flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift"
            >
              <div className="flex items-center gap-3">
                <Avatar name={c.name} color={c.color} size={40} className="ring-0" />
                <div className="min-w-0">
                  <h3 className="truncate font-serif text-[18px] leading-tight text-ink">{c.name || 'Unnamed character'}</h3>
                  <p className="text-[12px] text-faint">{[c.pronouns, c.age].filter(Boolean).join(' · ') || '—'}</p>
                </div>
              </div>
              <p className="mt-4 line-clamp-3 flex-1 font-serif text-[15px] leading-snug text-muted italic">
                {c.tagline || <span className="text-faint not-italic">No essence line yet.</span>}
              </p>
              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap gap-1">
                  {c.tags.slice(0, 3).map((t) => (
                    <Chip key={t}>{t}</Chip>
                  ))}
                </div>
                <span className="shrink-0 text-[11.5px] text-faint">{plural(appearances.get(c.id) ?? 0, 'story', 'stories')}</span>
              </div>
            </Link>
          ))}
          {list.length === 0 && <p className="col-span-full py-10 text-center text-[13px] text-faint">No characters match.</p>}
        </div>
      )}
    </Page>
  )
}
