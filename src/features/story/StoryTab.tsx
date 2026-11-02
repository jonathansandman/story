import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Heart, Plus, Sparkles, X } from 'lucide-react'
import { useCharacters, useRelationships } from '@/db/hooks'
import { addToCast, getOrCreateRelationship, mutateStory, removeFromCast, updateStory } from '@/db/repo'
import type { CastMember, Story, StoryStatus } from '@/db/types'
import { Avatar, Button, Field, Segmented, Select, TagInput, TextArea, TextInput } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/overlays'
import { Scroll } from '@/components/layout/Screen'
import { CharacterPicker } from '@/features/characters/CharacterPicker'
import { RelationshipDialog } from '@/features/characters/RelationshipEditor'
import { useAi } from '@/features/ai/ai-context'
import { STORY_STATUS } from '@/features/stories/status'
import { useStoryCtx } from './StoryShell'

/** Story setup in one place: the bible, the cast and their dynamics. */
export function StoryTab() {
  const { story } = useStoryCtx()
  const set = (patch: Partial<Story>) => updateStory(story.id, patch)
  return (
    <Scroll>
      <div className="mx-auto w-full max-w-2xl space-y-10 px-4 py-5 pb-16">
        <Group title="Essentials">
          <Field label="Title">
            <TextInput value={story.title} onCommit={(title) => set({ title })} placeholder="Untitled story" className="font-serif text-[18px]" />
          </Field>
          <Field label="Logline">
            <TextArea minRows={1} value={story.logline} onCommit={(logline) => set({ logline })} placeholder="Who wants what, and what's in the way" />
          </Field>
          <Field label="Premise">
            <TextArea minRows={3} value={story.premise} onCommit={(premise) => set({ premise })} placeholder="The shape of the whole story" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Genre">
              <TextInput value={story.genre} onCommit={(genre) => set({ genre })} placeholder="Contemporary romance" />
            </Field>
            <Field label="Heat">
              <TextInput value={story.heat} onCommit={(heat) => set({ heat })} placeholder="Slow burn → explicit" />
            </Field>
            <Field label="Point of view">
              <TextInput value={story.pov} onCommit={(pov) => set({ pov })} placeholder="Close third, alternating" />
            </Field>
            <Field label="Tense">
              <div>
                <Segmented
                  value={story.tense || 'none'}
                  onChange={(v) => set({ tense: v === 'none' ? '' : v })}
                  options={[
                    { value: 'past', label: 'Past' },
                    { value: 'present', label: 'Present' },
                    { value: 'none', label: 'Any' },
                  ]}
                />
              </div>
            </Field>
          </div>
          <Field label="Status">
            <Select<StoryStatus> value={story.status} onChange={(status) => set({ status })} options={Object.entries(STORY_STATUS).map(([value, label]) => ({ value: value as StoryStatus, label }))} className="w-48" />
          </Field>
        </Group>

        <Group title="Voice">
          <Field label="Style guide">
            <TextArea minRows={4} value={story.style} onCommit={(style) => set({ style })} placeholder="Voice, rhythm, what to emulate, what to avoid" />
          </Field>
          <Field label="Themes">
            <TagInput value={story.themes ?? []} onChange={(themes) => set({ themes })} placeholder="Add a theme" />
          </Field>
          <Field label="Content rules">
            <TextArea minRows={2} value={story.contentRules} onCommit={(contentRules) => set({ contentRules })} placeholder="Always… Never…" />
          </Field>
        </Group>

        <Group title="World">
          <Field label="Setting">
            <TextArea minRows={3} value={story.world} onCommit={(world) => set({ world })} placeholder="Places, season, texture" />
          </Field>
          <Field label="Tags">
            <TagInput value={story.tags} onChange={(tags) => set({ tags })} />
          </Field>
        </Group>

        <Cast story={story} />
      </div>
    </Scroll>
  )
}

function Group({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-serif text-[22px]">{title}</h2>
        {action}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function Cast({ story }: { story: Story }) {
  const characters = useCharacters()
  const relationships = useRelationships()
  const { openAi } = useAi()
  const toast = useToast()
  const [editing, setEditing] = useState<string | null>(null)
  const byId = useMemo(() => new Map((characters ?? []).map((c) => [c.id, c])), [characters])
  const castIds = story.cast.map((m) => m.characterId)
  const setMember = (id: string, patch: Partial<CastMember>) =>
    mutateStory(story.id, (s) => {
      const m = s.cast.find((x) => x.characterId === id)
      if (m) Object.assign(m, patch)
    })
  const pairs: [string, string][] = []
  for (let i = 0; i < castIds.length; i++) for (let j = i + 1; j < castIds.length; j++) pairs.push([castIds[i]!, castIds[j]!])
  const relFor = (a: string, b: string) => relationships?.find((r) => r.characterIds.includes(a) && r.characterIds.includes(b))

  return (
    <>
      <Group
        title="Cast"
        action={
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" aria-label="New character with AI" onClick={() => openAi({ kind: 'new-character', storyId: story.id })}>
              <Sparkles />
            </Button>
            <CharacterPicker
              selected={castIds}
              onChange={async (ids) => {
                for (const id of ids.filter((x) => !castIds.includes(x))) await addToCast(story.id, id)
                for (const id of castIds.filter((x) => !ids.includes(x))) await removeFromCast(story.id, id)
              }}
              trigger={
                <Button variant="ghost" size="icon" aria-label="Add to cast">
                  <Plus />
                </Button>
              }
            />
          </div>
        }
      >
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {story.cast.map((m) => {
            const c = byId.get(m.characterId)
            if (!c) return null
            return (
              <li key={m.characterId} className="space-y-3 p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={c.name} color={c.color} size={40} className="ring-0" />
                  <Link to={`/characters/${c.id}`} className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-[18px] leading-tight">{c.name || 'Unnamed'}</span>
                    {c.tagline && <span className="block truncate text-[13px] text-muted">{c.tagline}</span>}
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${c.name} from this story`}
                    onClick={async () => {
                      const undo = await removeFromCast(story.id, c.id)
                      toast(`${c.name} removed from cast`, undefined, { action: { label: 'Undo', run: undo } })
                    }}
                  >
                    <X />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <Field label="Role">
                    <TextInput value={m.role} onCommit={(role) => setMember(c.id, { role })} placeholder="Protagonist" />
                  </Field>
                  <Field label="In this story">
                    <TextArea minRows={1} value={m.storyNotes} onCommit={(storyNotes) => setMember(c.id, { storyNotes })} placeholder="True only in this story" />
                  </Field>
                </div>
              </li>
            )
          })}
        </ul>
      </Group>

      {pairs.length > 0 && (
        <Group title="Dynamics">
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {pairs.map(([a, b]) => {
              const ca = byId.get(a)
              const cb = byId.get(b)
              if (!ca || !cb) return null
              const r = relFor(a, b)
              return (
                <li key={`${a}-${b}`}>
                  <button onClick={async () => setEditing((r ?? (await getOrCreateRelationship(a, b))).id)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60">
                    <span className="flex -space-x-2">
                      <Avatar name={ca.name} color={ca.color} size={28} />
                      <Avatar name={cb.name} color={cb.color} size={28} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">
                        {ca.name.split(' ')[0]} & {cb.name.split(' ')[0]}
                      </span>
                      <span className="block truncate text-[13px] text-faint">{r?.label || (r ? 'Untitled' : 'Not defined')}</span>
                    </span>
                    {r ? <Heart size={16} className="text-accent" /> : <Plus size={16} className="text-faint" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </Group>
      )}
      <RelationshipDialog relationshipId={editing} characters={byId} onClose={() => setEditing(null)} />
    </>
  )
}
