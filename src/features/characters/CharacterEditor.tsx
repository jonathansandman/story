import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ChevronLeft, Copy, CopyPlus, FileText, Heart, MoreHorizontal, Plus, Sparkles, Star, Trash2, X } from 'lucide-react'
import { useAi } from '@/features/ai/ai-context'
import { useCharacter, useCharacters, useRelationships, useStories } from '@/db/hooks'
import { deleteCharacter, duplicateCharacter, getOrCreateRelationship, mutateCharacter, updateCharacter } from '@/db/repo'
import { CHARACTER_COLORS, makeTrait } from '@/db/factories'
import type { Character, DetailLevel, Trait } from '@/db/types'
import { characterSheet } from '@/export/build'
import { render } from '@/export/render'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { estimateTokens } from '@/lib/text'
import { Avatar, Button, Field, Segmented, TagInput, TextArea, TextInput } from '@/components/ui/primitives'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger, Sheet, useConfirm, useToast } from '@/components/ui/overlays'
import { LibraryScreen } from '@/components/layout/AppShell'
import { Scroll } from '@/components/layout/Screen'
import { CharacterPicker } from './CharacterPicker'
import { RelationshipDialog } from './RelationshipEditor'
import { PromptPreview } from '@/features/export/PromptComposer'

export function CharacterEditor() {
  const { characterId } = useParams()
  const c = useCharacter(characterId)
  if (c === undefined) return null
  if (c === null)
    return (
      <LibraryScreen title="Characters">
        <p className="p-10 text-muted">Character not found.</p>
      </LibraryScreen>
    )
  return <Editor key={c.id} c={c} />
}

const SECTIONS = [
  ['looks', 'Looks'],
  ['inner', 'Inner life'],
  ['voice', 'Voice'],
  ['intimacy', 'Intimacy'],
  ['history', 'History'],
  ['links', 'Relationships'],
  ['notes', 'Notes'],
] as const

function Editor({ c }: { c: Character }) {
  const set = (patch: Partial<Character>) => updateCharacter(c.id, patch)
  const navigate = useNavigate()
  const { confirm, element } = useConfirm()
  const { openAi } = useAi()
  const [preview, setPreview] = useState(false)

  const jump = (id: string) => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <LibraryScreen
      tabs={false}
      left={
        <Button variant="ghost" size="icon" onClick={() => navigate('/characters')} aria-label="All characters">
          <ChevronLeft />
        </Button>
      }
      title={<p className="truncate font-serif text-[19px]">{c.name || 'New character'}</p>}
      ai={[{ icon: <Sparkles />, label: `Develop ${c.name || 'this character'}`, run: () => openAi({ kind: 'character', characterId: c.id }) }]}
      menu={
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Character menu">
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={<FileText />} onSelect={() => setPreview(true)}>
              Preview as prompt
            </MenuItem>
            <MenuItem
              icon={<CopyPlus />}
              onSelect={async () => {
                const copy = await duplicateCharacter(c.id)
                if (copy) navigate(`/characters/${copy.id}`)
              }}
            >
              Duplicate
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              danger
              icon={<Trash2 />}
              onSelect={async () => {
                if (await confirm(`Delete ${c.name || 'this character'}?`, { body: 'They’re removed from every story, chapter and beat.' })) {
                  await deleteCharacter(c.id)
                  navigate('/characters')
                }
              }}
            >
              Delete character
            </MenuItem>
          </MenuContent>
        </Menu>
      }
    >
      <Scroll>
        {/* Section bar: jump anywhere on a long sheet. */}
        <nav className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-line bg-bg/95 px-3 py-2 backdrop-blur [scrollbar-width:none]">
          {SECTIONS.map(([id, label]) => (
            <button key={id} onClick={() => jump(id)} className="h-9 shrink-0 rounded-full px-3.5 text-[13.5px] text-muted hover:bg-surface-2 hover:text-ink">
              {label}
            </button>
          ))}
        </nav>

        <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-20">
          <div className="flex items-start gap-4">
            <ColorPicker value={c.color} name={c.name} onChange={(color) => set({ color })} />
            <div className="min-w-0 flex-1 space-y-3">
              <TextInput variant="quiet" value={c.name} onCommit={(name) => set({ name })} placeholder="Name" autoFocus={!c.name} className="font-serif text-[28px] leading-tight" aria-label="Name" />
              <TextArea variant="quiet" minRows={1} value={c.tagline} onCommit={(tagline) => set({ tagline })} placeholder="Who they are, in one line" className="font-serif text-[17px] text-muted italic" aria-label="Essence" />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Pronouns">
              <TextInput value={c.pronouns} onCommit={(pronouns) => set({ pronouns })} placeholder="she/her" />
            </Field>
            <Field label="Age">
              <TextInput value={c.age} onCommit={(age) => set({ age })} placeholder="34" />
            </Field>
            <Field label="Also called" className="col-span-2">
              <TextInput value={c.aka} onCommit={(aka) => set({ aka })} placeholder="Nicknames" />
            </Field>
          </div>
          <Field label="Tags" className="mt-4">
            <TagInput value={c.tags} onChange={(tags) => set({ tags })} placeholder="Add a tag" />
          </Field>

          <Section id="looks" title="Looks">
            <Traits c={c} />
          </Section>

          <Section id="inner" title="Inner life">
            <Field label="Personality">
              <TextArea minRows={3} value={c.personality} onCommit={(personality) => set({ personality })} placeholder="How they move through a room; what they hide" />
            </Field>
            <Field label="Wants">
              <TextArea value={c.motivations} onCommit={(motivations) => set({ motivations })} placeholder="What they want — and what they'd never admit to" />
            </Field>
          </Section>

          <Section id="voice" title="Voice">
            <Field label="How they talk">
              <TextArea value={c.voice} onCommit={(voice) => set({ voice })} placeholder="Rhythm, vocabulary, what they never say" />
            </Field>
            <SampleLines c={c} />
          </Section>

          <Section id="intimacy" title="Intimacy">
            <Field label="Desires">
              <TextArea minRows={3} value={c.desires} onCommit={(desires) => set({ desires })} placeholder="What draws them in; what undoes them" />
            </Field>
            <Field label="Boundaries">
              <TextArea value={c.boundaries} onCommit={(boundaries) => set({ boundaries })} placeholder="Hard limits · soft limits" />
            </Field>
          </Section>

          <Section id="history" title="History">
            <Field label="Backstory">
              <TextArea minRows={4} value={c.backstory} onCommit={(backstory) => set({ backstory })} placeholder="The few things that made them who they are" />
            </Field>
          </Section>

          <Section id="links" title="Relationships">
            <Relationships c={c} />
            <AppearsIn c={c} />
          </Section>

          <Section id="notes" title="Private notes">
            <TextArea minRows={3} value={c.notes} onCommit={(notes) => set({ notes })} placeholder="Just for you — never sent to the AI" />
          </Section>
        </div>
      </Scroll>

      <Sheet open={preview} onOpenChange={setPreview} title="Preview as prompt" className="lg:w-[520px]">
        <SheetPreview c={c} />
      </Sheet>
      {element}
    </LibraryScreen>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={`sec-${id}`} className="mt-10 scroll-mt-16">
      <h2 className="mb-4 font-serif text-[22px]">{title}</h2>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function ColorPicker({ value, name, onChange }: { value: string; name: string; onChange: (c: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="mt-1 shrink-0 rounded-full" aria-label="Colour">
          <Avatar name={name || '?'} color={value} size={56} className="ring-4 ring-surface-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <div className="flex gap-1.5">
          {CHARACTER_COLORS.map((col) => (
            <button
              key={col}
              onClick={() => onChange(col)}
              className={cn('h-9 w-9 rounded-full ring-offset-2 ring-offset-surface', col === value && 'ring-2 ring-ink/40')}
              style={{ background: col }}
              aria-label={col}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Appearance as modular traits. "Key" traits go into every prompt; the rest
 * only into full-detail ones. Rows stack label-over-value on phones.
 */
function Traits({ c }: { c: Character }) {
  const edit = (traitId: string, patch: Partial<Trait>) =>
    mutateCharacter(c.id, (x) => {
      const t = x.appearance.find((t) => t.id === traitId)
      if (t) Object.assign(t, patch)
    })
  return (
    <div className="space-y-3">
      {c.appearance.map((t) => (
        <div key={t.id} className="rounded-xl border border-line bg-surface p-3">
          <div className="flex items-center gap-2">
            <TextInput variant="quiet" value={t.label} onCommit={(label) => edit(t.id, { label })} placeholder="Feature" className="flex-1 text-[14px] font-medium" aria-label="Feature" />
            <button
              onClick={() => edit(t.id, { essential: !t.essential })}
              aria-pressed={t.essential}
              aria-label={t.essential ? 'Key trait: always in prompts' : 'Detail: only in full-detail prompts'}
              className={cn(
                'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors lg:h-7',
                t.essential ? 'bg-accent-soft text-accent' : 'text-faint hover:bg-surface-2',
              )}
            >
              <Star size={13} fill={t.essential ? 'currentColor' : 'none'} /> Key
            </button>
            <Button variant="ghost" size="icon-sm" aria-label="Remove trait" onClick={() => mutateCharacter(c.id, (x) => void (x.appearance = x.appearance.filter((y) => y.id !== t.id)))}>
              <X />
            </Button>
          </div>
          <TextArea variant="quiet" minRows={1} value={t.value} onCommit={(value) => edit(t.id, { value })} placeholder="One precise detail" className="mt-1 text-[15px]" aria-label={`${t.label || 'Feature'} description`} />
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={() => mutateCharacter(c.id, (x) => void x.appearance.push(makeTrait()))}>
        <Plus /> Add feature
      </Button>
    </div>
  )
}

function SampleLines({ c }: { c: Character }) {
  return (
    <Field label="Sample lines">
      <div className="space-y-2">
        {c.sampleLines.map((line, i) => (
          <div key={i} className="flex items-start gap-2">
            <TextArea minRows={1} value={line} onCommit={(v) => mutateCharacter(c.id, (x) => void (x.sampleLines[i] = v))} className="font-serif text-[15px] italic" placeholder="Something only they would say" />
            <Button variant="ghost" size="icon-sm" aria-label="Remove line" onClick={() => mutateCharacter(c.id, (x) => void x.sampleLines.splice(i, 1))}>
              <X />
            </Button>
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
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2 px-4 pt-2 pb-3">
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
        <span className="flex-1 text-right text-[12.5px] text-faint tabular-nums">~{estimateTokens(out)} tokens</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await copyText(out)
            toast('Copied')
          }}
        >
          <Copy /> Copy
        </Button>
      </div>
      <div className="min-h-0 overflow-y-auto border-t border-line px-4 py-3 [&_pre]:text-[12px]">
        <PromptPreview text={out} format="markdown" />
      </div>
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
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {mine.map((r) => {
          const other = byId.get(r.characterIds[0] === c.id ? r.characterIds[1] : r.characterIds[0])
          if (!other) return null
          return (
            <li key={r.id}>
              <button onClick={() => setEditing(r.id)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2/60">
                <Avatar name={other.name} color={other.color} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{other.name}</span>
                  <span className="block truncate text-[13px] text-faint">{r.label || 'Not defined'}</span>
                </span>
                <Heart size={15} className="text-faint" />
              </button>
            </li>
          )
        })}
        <li>
          <CharacterPicker
            single
            selected={[]}
            pool={(characters ?? []).filter((x) => x.id !== c.id && !mine.some((r) => r.characterIds.includes(x.id))).map((x) => x.id)}
            onChange={async ([other]) => {
              if (!other || other === c.id) return
              setEditing((await getOrCreateRelationship(c.id, other)).id)
            }}
            trigger={
              <button className="flex min-h-12 w-full items-center gap-2 px-3 text-left text-[14px] text-muted hover:bg-surface-2/60">
                <Plus size={16} /> Add relationship
              </button>
            }
          />
        </li>
      </ul>
      <RelationshipDialog relationshipId={editing} characters={byId} onClose={() => setEditing(null)} />
    </div>
  )
}

function AppearsIn({ c }: { c: Character }) {
  const stories = useStories()
  const list = (stories ?? []).filter((s) => s.cast.some((m) => m.characterId === c.id))
  if (!list.length) return null
  return (
    <Field label="In stories">
      <div className="flex flex-wrap gap-2">
        {list.map((s) => (
          <Link key={s.id} to={`/stories/${s.id}/story`} className="flex h-9 items-center rounded-full border border-line bg-surface px-3.5 font-serif text-[14.5px] hover:border-line-strong">
            {s.title || 'Untitled'}
            {s.cast.find((m) => m.characterId === c.id)?.role && <span className="ml-2 font-sans text-[12px] text-faint">{s.cast.find((m) => m.characterId === c.id)!.role}</span>}
          </Link>
        ))}
      </div>
    </Field>
  )
}
