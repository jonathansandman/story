import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Copy, CopyPlus, Heart, MoreHorizontal, Plus, Star, Trash2, Wand2, X } from 'lucide-react'
import { useAi } from '@/features/ai/ai-context'
import { useCharacter, useCharacters, useRelationships, useStories } from '@/db/hooks'
import { deleteCharacter, duplicateCharacter, getOrCreateRelationship, mutateCharacter, updateCharacter } from '@/db/repo'
import { CHARACTER_COLORS, makeTrait } from '@/db/factories'
import type { Character, DetailLevel, Trait } from '@/db/types'
import { characterSheet } from '@/export/build'
import { render } from '@/export/render'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { estimateTokens, relativeTime } from '@/lib/text'
import { Avatar, Button, EmptyState, Field, Segmented, TagInput, TextArea, TextInput } from '@/components/ui/primitives'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger, useConfirm, useToast } from '@/components/ui/overlays'
import { CharacterPicker } from './CharacterPicker'
import { RelationshipDialog } from './RelationshipEditor'
import { PromptPreview } from '@/features/export/PromptComposer'

export function CharacterEditor() {
  const { characterId } = useParams()
  const c = useCharacter(characterId)
  if (c === undefined) return null
  if (c === null)
    return (
      <div className="p-12">
        <EmptyState title="Character not found" action={<Link to="/characters" className="text-accent">Back to characters</Link>} />
      </div>
    )
  return <Editor key={c.id} c={c} />
}

function Editor({ c }: { c: Character }) {
  const set = (patch: Partial<Character>) => updateCharacter(c.id, patch)
  const navigate = useNavigate()
  const { confirm, element } = useConfirm()
  const { openAi } = useAi()

  return (
    <div className="mx-auto flex w-full max-w-[1280px] gap-10 px-4 py-8 sm:px-8 lg:py-10">
      <div className="min-w-0 flex-1">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/characters" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
            <ArrowLeft size={14} /> Characters
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-faint max-sm:hidden">Saved {relativeTime(c.updatedAt)}</span>
            <Button size="sm" onClick={() => openAi({ kind: 'character', characterId: c.id })}>
              <Wand2 /> Develop with AI
            </Button>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More">
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem
                  icon={<CopyPlus />}
                  onSelect={async () => {
                    const copy = await duplicateCharacter(c.id)
                    if (copy) navigate(`/characters/${copy.id}`)
                  }}
                >
                  Duplicate as a variant
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  danger
                  icon={<Trash2 />}
                  onSelect={async () => {
                    if (await confirm(`Delete ${c.name || 'this character'}?`, { body: 'They will be removed from every story, chapter and beat. This cannot be undone (except from a snapshot).' })) {
                      await deleteCharacter(c.id)
                      navigate('/characters')
                    }
                  }}
                >
                  Delete character
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </div>

        {/* Identity */}
        <header className="flex items-start gap-5">
          <ColorPicker value={c.color} name={c.name} onChange={(color) => set({ color })} />
          <div className="min-w-0 flex-1">
            <TextInput
              variant="quiet"
              value={c.name}
              onCommit={(name) => set({ name })}
              placeholder="Character name"
              autoFocus={!c.name}
              className="font-serif text-[34px] leading-tight tracking-tight"
              aria-label="Name"
            />
            <TextArea
              variant="quiet"
              minRows={1}
              value={c.tagline}
              onCommit={(tagline) => set({ tagline })}
              placeholder="Who are they, in one line? (Always exported — make it count.)"
              className="mt-1 font-serif text-[18px] text-muted italic"
              aria-label="Essence"
            />
          </div>
        </header>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Pronouns">
            <TextInput value={c.pronouns} onCommit={(pronouns) => set({ pronouns })} placeholder="she/her" />
          </Field>
          <Field label="Age">
            <TextInput value={c.age} onCommit={(age) => set({ age })} placeholder="34" />
          </Field>
          <Field label="Also called" className="col-span-2">
            <TextInput value={c.aka} onCommit={(aka) => set({ aka })} placeholder="Nicknames, titles, pet names" />
          </Field>
        </div>
        <Field label="Tags" className="mt-4">
          <TagInput value={c.tags} onChange={(tags) => set({ tags })} placeholder="lead, POV, antagonist…" />
        </Field>

        <Section title="Appearance" subtitle="Modular traits. Starred ones are always exported; the rest only at full detail.">
          <Traits c={c} />
        </Section>

        <Section title="Inner life">
          <Field label="Personality">
            <TextArea minRows={3} value={c.personality} onCommit={(personality) => set({ personality })} placeholder="How do they move through a room? What do they hide, and from whom?" />
          </Field>
          <Field label="Wants" hint="What they're after — in the story and underneath it.">
            <TextArea value={c.motivations} onCommit={(motivations) => set({ motivations })} placeholder="What do they want? What do they want that they'd never admit to?" />
          </Field>
        </Section>

        <Section title="Voice" subtitle="How they sound is how the AI will make them sound.">
          <Field label="Speech patterns">
            <TextArea value={c.voice} onCommit={(voice) => set({ voice })} placeholder="Rhythm, vocabulary, what they never say, what they say when they're lying." />
          </Field>
          <SampleLines c={c} />
        </Section>

        <Section title="Intimacy" subtitle="Specific beats generic. Write what this person wants, not what anyone might.">
          <Field label="Desires, preferences, kinks">
            <TextArea minRows={3} value={c.desires} onCommit={(desires) => set({ desires })} placeholder="What draws them in? What undoes them? What are they shy of wanting?" />
          </Field>
          <Field
            label={
              <span className="inline-flex items-center gap-1.5">
                Boundaries <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-medium text-accent">Always exported</span>
              </span>
            }
            hint="Hard limits, soft limits, what makes them freeze. Included at every detail level."
          >
            <TextArea value={c.boundaries} onCommit={(boundaries) => set({ boundaries })} placeholder="Hard: … Soft: …" />
          </Field>
        </Section>

        <Section title="History">
          <Field label="Backstory" hint="Exported at full detail only — keep the most load-bearing facts in Personality or the essence line.">
            <TextArea minRows={4} value={c.backstory} onCommit={(backstory) => set({ backstory })} placeholder="The three or four things that made them who they are." />
          </Field>
        </Section>

        <Section title="Private notes" subtitle="Arcs, ideas, reminders. Never exported unless you switch it on in the composer.">
          <TextArea minRows={3} value={c.notes} onCommit={(notes) => set({ notes })} placeholder="Just for you." />
        </Section>

        {/* Below xl the side rail is hidden, so its tools live at the end of the page. */}
        <div className="mt-12 space-y-10 border-t border-line pt-8 xl:hidden">
          <Relationships c={c} />
          <AppearsIn c={c} />
          <SheetPreview c={c} />
        </div>
        {element}
      </div>

      <aside className="hidden w-[380px] shrink-0 xl:block">
        <div className="sticky top-10 space-y-8">
          <SheetPreview c={c} />
          <Relationships c={c} />
          <AppearsIn c={c} />
        </div>
      </aside>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <div className="mb-4 border-b border-line pb-2">
        <h2 className="font-serif text-[21px] text-ink">{title}</h2>
        {subtitle && <p className="text-[12.5px] text-faint">{subtitle}</p>}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function ColorPicker({ value, name, onChange }: { value: string; name: string; onChange: (c: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="mt-1 rounded-full transition-transform hover:scale-105" aria-label="Change colour">
          <Avatar name={name || '?'} color={value} size={64} className="ring-4 ring-surface-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <div className="flex gap-1.5">
          {CHARACTER_COLORS.map((col) => (
            <button
              key={col}
              onClick={() => onChange(col)}
              className={cn('h-7 w-7 rounded-full ring-offset-2 ring-offset-surface', col === value && 'ring-2 ring-ink/40')}
              style={{ background: col }}
              aria-label={col}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Traits({ c }: { c: Character }) {
  const edit = (traitId: string, patch: Partial<Trait>) =>
    mutateCharacter(c.id, (x) => {
      const t = x.appearance.find((t) => t.id === traitId)
      if (t) Object.assign(t, patch)
    })
  return (
    <div className="space-y-2">
      {c.appearance.map((t) => (
        <div key={t.id} className="group flex items-start gap-2">
          <button
            onClick={() => edit(t.id, { essential: !t.essential })}
            className={cn('mt-2 rounded p-0.5 transition-colors', t.essential ? 'text-accent' : 'text-line-strong hover:text-faint')}
            title={t.essential ? 'Essential — always exported' : 'Detail — exported at full detail only'}
            aria-label="Toggle essential"
          >
            <Star size={15} fill={t.essential ? 'currentColor' : 'none'} />
          </button>
          <TextInput value={t.label} onCommit={(label) => edit(t.id, { label })} placeholder="Label" className="w-32 shrink-0 font-medium" />
          <TextArea
            minRows={1}
            value={t.value}
            onCommit={(value) => edit(t.id, { value })}
            placeholder="Be specific — one striking detail beats five generic ones."
          />
          <button
            onClick={() => mutateCharacter(c.id, (x) => void (x.appearance = x.appearance.filter((y) => y.id !== t.id)))}
            className="mt-2 rounded p-0.5 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink focus:opacity-100"
            aria-label="Remove trait"
          >
            <X size={15} />
          </button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={() => mutateCharacter(c.id, (x) => void x.appearance.push(makeTrait()))} className="ml-6">
        <Plus /> Add trait
      </Button>
    </div>
  )
}

function SampleLines({ c }: { c: Character }) {
  return (
    <Field label="Sample lines" hint="Two or three lines of dialogue teach a model a voice faster than any description.">
      <div className="space-y-2">
        {c.sampleLines.map((line, i) => (
          <div key={i} className="group flex items-start gap-2">
            <span className="mt-1.5 font-serif text-[20px] leading-none text-faint">“</span>
            <TextArea
              minRows={1}
              value={line}
              onCommit={(v) => mutateCharacter(c.id, (x) => void (x.sampleLines[i] = v))}
              className="font-serif text-[15px] italic"
              placeholder="Something only they would say."
            />
            <button
              onClick={() => mutateCharacter(c.id, (x) => void x.sampleLines.splice(i, 1))}
              className="mt-2 rounded p-0.5 text-faint opacity-0 group-hover:opacity-100 hover:text-ink focus:opacity-100"
              aria-label="Remove line"
            >
              <X size={15} />
            </button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => mutateCharacter(c.id, (x) => void x.sampleLines.push(''))}>
          <Plus /> Add a line
        </Button>
      </div>
    </Field>
  )
}

function SheetPreview({ c }: { c: Character }) {
  const [level, setLevel] = useState<DetailLevel>('standard')
  const toast = useToast()
  const out = useMemo(() => render({ title: '', sections: [characterSheet(c, level)] }, 'markdown'), [c, level])
  const tokens = estimateTokens(out)
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11.5px] font-semibold tracking-[0.08em] text-faint uppercase">As exported</h3>
        <span className={cn('text-[11.5px] tabular-nums', tokens > 900 ? 'text-warn' : 'text-faint')}>~{tokens} tokens</span>
      </div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Segmented
          size="sm"
          value={level}
          onChange={setLevel}
          options={[
            { value: 'brief', label: 'Brief' },
            { value: 'standard', label: 'Standard' },
            { value: 'full', label: 'Full' },
          ]}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await copyText(out)
            toast('Character sheet copied')
          }}
        >
          <Copy /> Copy
        </Button>
      </div>
      <div className="max-h-[48vh] overflow-y-auto rounded-xl border border-line bg-surface p-4 [&_pre]:text-[11.5px]">
        <PromptPreview text={out} format="markdown" />
      </div>
      {tokens > 900 && <p className="mt-2 text-[12px] text-warn">This sheet is long. Consider starring fewer traits or tightening personality.</p>}
    </div>
  )
}

function Relationships({ c }: { c: Character }) {
  const all = useRelationships()
  const characters = useCharacters()
  const [editing, setEditing] = useState<string | null>(null)
  const byId = useMemo(() => new Map((characters ?? []).map((x) => [x.id, x])), [characters])
  const mine = (all ?? []).filter((r) => r.characterIds.includes(c.id))

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11.5px] font-semibold tracking-[0.08em] text-faint uppercase">Relationships</h3>
        <CharacterPicker
          single
          selected={[]}
          pool={(characters ?? []).filter((x) => x.id !== c.id && !mine.some((r) => r.characterIds.includes(x.id))).map((x) => x.id)}
          onChange={async ([other]) => {
            if (!other || other === c.id) return
            const r = await getOrCreateRelationship(c.id, other)
            setEditing(r.id)
          }}
          trigger={
            <Button size="sm" variant="ghost">
              <Plus /> Add
            </Button>
          }
        />
      </div>
      {mine.length === 0 && <p className="text-[12.5px] text-faint">No dynamics defined. Relationships are exported when both people are on the page.</p>}
      <ul className="space-y-1">
        {mine.map((r) => {
          const other = byId.get(r.characterIds[0] === c.id ? r.characterIds[1] : r.characterIds[0])
          if (!other) return null
          return (
            <li key={r.id}>
              <button onClick={() => setEditing(r.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 -mx-2 text-left hover:bg-surface-2">
                <Avatar name={other.name} color={other.color} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px]">{other.name}</span>
                  <span className="block truncate text-[12px] text-faint">{r.label || 'Undefined dynamic'}</span>
                </span>
                <Heart size={14} className="text-faint" />
              </button>
            </li>
          )
        })}
      </ul>
      <RelationshipDialog relationshipId={editing} characters={byId} onClose={() => setEditing(null)} />
    </div>
  )
}

function AppearsIn({ c }: { c: Character }) {
  const stories = useStories()
  const list = (stories ?? []).filter((s) => s.cast.some((m) => m.characterId === c.id))
  return (
    <div>
      <h3 className="mb-3 text-[11.5px] font-semibold tracking-[0.08em] text-faint uppercase">Appears in</h3>
      {list.length === 0 && <p className="text-[12.5px] text-faint">Not cast in any story yet.</p>}
      <ul className="space-y-1">
        {list.map((s) => (
          <li key={s.id}>
            <Link to={`/stories/${s.id}/cast`} className="block rounded-lg px-2 py-1.5 -mx-2 hover:bg-surface-2">
              <span className="block font-serif text-[15px]">{s.title || 'Untitled story'}</span>
              <span className="block text-[12px] text-faint">{s.cast.find((m) => m.characterId === c.id)?.role || 'Cast'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
