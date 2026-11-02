import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import { ArrowUpRight, Heart, Plus, Wand2, X } from 'lucide-react'
import { useAi } from '@/features/ai/ai-context'
import { useCharacters, useRelationships } from '@/db/hooks'
import { addToCast, getOrCreateRelationship, mutateStory, updateStory } from '@/db/repo'
import type { CastMember } from '@/db/types'
import { Avatar, Button, EmptyState, TextArea, TextInput } from '@/components/ui/primitives'
import { CharacterPicker } from '@/features/characters/CharacterPicker'
import { RelationshipDialog } from '@/features/characters/RelationshipEditor'
import type { StoryOutletContext } from './StoryLayout'

/**
 * Cast = which library characters take part in this story, their role, and a
 * story-specific overlay. Below it, every pair in the cast, so dynamics are
 * visible (and missing ones obvious).
 */
export function CastView() {
  const { story } = useOutletContext<StoryOutletContext>()
  const characters = useCharacters()
  const relationships = useRelationships()
  const [editing, setEditing] = useState<string | null>(null)
  const { openAi } = useAi()
  const byId = useMemo(() => new Map((characters ?? []).map((c) => [c.id, c])), [characters])

  const castIds = story.cast.map((m) => m.characterId)
  const setMember = (id: string, patch: Partial<CastMember>) =>
    mutateStory(story.id, (s) => {
      const m = s.cast.find((x) => x.characterId === id)
      if (m) Object.assign(m, patch)
    })

  const pairs = useMemo(() => {
    const out: [string, string][] = []
    for (let i = 0; i < castIds.length; i++) for (let j = i + 1; j < castIds.length; j++) out.push([castIds[i]!, castIds[j]!])
    return out
  }, [castIds])

  const relFor = (a: string, b: string) => relationships?.find((r) => r.characterIds.includes(a) && r.characterIds.includes(b))

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8 lg:py-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-lg text-[13.5px] text-muted">Characters come from your library. Anything specific to this story goes in its notes here — the master sheet stays clean.</p>
        <CharacterPicker
          selected={castIds}
          onChange={async (ids) => {
            const added = ids.filter((id) => !castIds.includes(id))
            const removed = castIds.filter((id) => !ids.includes(id))
            for (const id of added) await addToCast(story.id, id)
            if (removed.length) await updateStory(story.id, { cast: story.cast.filter((m) => !removed.includes(m.characterId)) })
          }}
          trigger={
            <Button variant="primary">
              <Plus /> Cast a character
            </Button>
          }
        />
        <Button onClick={() => openAi({ kind: 'new-character', storyId: story.id })}>
          <Wand2 /> New character with AI
        </Button>
      </div>

      {story.cast.length === 0 && <EmptyState title="No one cast yet">Add characters from your library, or create a new one from the picker.</EmptyState>}

      <div className="space-y-3">
        {story.cast.map((m) => {
          const c = byId.get(m.characterId)
          if (!c) return null
          return (
            <div key={m.characterId} className="group flex gap-4 rounded-2xl border border-line bg-surface p-5 shadow-soft">
              <Avatar name={c.name} color={c.color} size={44} className="ring-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <Link to={`/characters/${c.id}`} className="inline-flex items-center gap-1 font-serif text-[19px] text-ink hover:text-accent">
                    {c.name || 'Unnamed'} <ArrowUpRight size={14} className="text-faint" />
                  </Link>
                  <TextInput variant="quiet" value={m.role} onCommit={(role) => setMember(c.id, { role })} placeholder="Role in this story" className="w-auto max-w-56 text-[13px] text-muted max-sm:text-[16px]" />
                </div>
                {c.tagline && <p className="font-serif text-[14.5px] text-muted italic">{c.tagline}</p>}
                <TextArea
                  minRows={1}
                  value={m.storyNotes}
                  onCommit={(storyNotes) => setMember(c.id, { storyNotes })}
                  placeholder="In this story… (exported as part of their sheet)"
                  className="text-[13px] max-sm:text-[16px]"
                />
              </div>
              <button
                onClick={() => updateStory(story.id, { cast: story.cast.filter((x) => x.characterId !== c.id) })}
                className="self-start rounded-lg p-1.5 text-faint opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-ink focus:opacity-100"
                aria-label={`Remove ${c.name} from cast`}
                title="Remove from this story (keeps the character in your library)"
              >
                <X size={15} />
              </button>
            </div>
          )
        })}
      </div>

      {pairs.length > 0 && (
        <section className="mt-12">
          <h2 className="font-serif text-[21px]">Dynamics</h2>
          <p className="mb-4 text-[12.5px] text-faint">Every pair in the cast. A defined dynamic is exported whenever both are on the page.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {pairs.map(([a, b]) => {
              const ca = byId.get(a)
              const cb = byId.get(b)
              if (!ca || !cb) return null
              const r = relFor(a, b)
              return (
                <button
                  key={`${a}-${b}`}
                  onClick={async () => setEditing((r ?? (await getOrCreateRelationship(a, b))).id)}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-soft transition-colors hover:border-line-strong"
                >
                  <span className="flex -space-x-2">
                    <Avatar name={ca.name} color={ca.color} size={30} />
                    <Avatar name={cb.name} color={cb.color} size={30} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px]">
                      {ca.name.split(' ')[0]} & {cb.name.split(' ')[0]}
                    </span>
                    <span className="block truncate text-[12px] text-faint">{r?.label || (r ? 'Untitled dynamic' : 'Define this dynamic')}</span>
                  </span>
                  {r ? <Heart size={14} className="text-accent" /> : <Plus size={14} className="text-faint" />}
                </button>
              )
            })}
          </div>
        </section>
      )}
      <RelationshipDialog relationshipId={editing} characters={byId} onClose={() => setEditing(null)} />
    </div>
  )
}
