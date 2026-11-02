import { useState, type ReactNode } from 'react'
import { Check, Plus, Search } from 'lucide-react'
import { useCharacters } from '@/db/hooks'
import { createCharacter } from '@/db/repo'
import type { Character } from '@/db/types'
import { cn } from '@/lib/cn'
import { matches } from '@/lib/text'
import { Avatar } from '@/components/ui/primitives'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays'

/**
 * Multi-select character picker in a popover. `pool` restricts choices (e.g.
 * to a story's cast) with an escape hatch to show everyone.
 */
export function CharacterPicker({
  selected,
  onChange,
  pool,
  trigger,
  single,
}: {
  selected: string[]
  onChange: (ids: string[]) => void
  pool?: string[]
  trigger: ReactNode
  single?: boolean
}) {
  const all = useCharacters()
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState(false)

  const inPool = (c: Character) => !pool || showAll || pool.includes(c.id)
  const list = (all ?? []).filter((c) => inPool(c) && (!q || matches(`${c.name} ${c.aka} ${c.tags.join(' ')}`, q)))

  const toggle = (id: string) => {
    if (single) {
      onChange(selected[0] === id ? [] : [id])
      setOpen(false)
    } else onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  const create = async () => {
    const c = await createCharacter({ name: q.trim() || 'New character' })
    toggle(c.id)
    setQ('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent>
        <div className="flex items-center gap-2 border-b border-line px-2 pb-1.5">
          <Search size={14} className="text-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a character…"
            className="h-8 flex-1 bg-transparent text-[13px] outline-none"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {list.map((c) => {
            const on = selected.includes(c.id)
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
              >
                <Avatar name={c.name} color={c.color} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{c.name || 'Unnamed'}</span>
                </span>
                <span className={cn('flex h-4.5 w-4.5 items-center justify-center rounded-md border', on ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong')}>
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
              </button>
            )
          })}
          {list.length === 0 && <p className="px-2 py-3 text-[12.5px] text-faint">No matches.</p>}
        </div>
        <div className="flex items-center justify-between border-t border-line px-1 pt-1.5">
          {pool && !showAll ? (
            <button onClick={() => setShowAll(true)} className="rounded-md px-2 py-1 text-[12px] text-muted hover:bg-surface-2">
              Show all characters
            </button>
          ) : (
            <span />
          )}
          <button onClick={create} className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-accent hover:bg-accent-soft">
            <Plus size={13} /> {q.trim() ? `Create “${q.trim()}”` : 'New character'}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Inline row of avatars + names that opens the picker. */
export function CharacterChips({
  ids,
  characters,
  onChange,
  pool,
  placeholder = 'Add characters',
  inheritedFrom,
}: {
  ids: string[]
  characters: Map<string, Character>
  onChange: (ids: string[]) => void
  pool?: string[]
  placeholder?: string
  /** Shown faintly when `ids` is empty, to indicate inheritance. */
  inheritedFrom?: { label: string; ids: string[] }
}) {
  const shown = ids.length ? ids : (inheritedFrom?.ids ?? [])
  const inherited = !ids.length && shown.length > 0
  return (
    <CharacterPicker
      selected={ids}
      onChange={onChange}
      pool={pool}
      trigger={
        <button className="group flex min-h-7 flex-wrap items-center gap-1.5 rounded-lg px-1.5 py-0.5 -mx-1.5 text-left hover:bg-surface-2">
          {shown.map((id) => {
            const c = characters.get(id)
            if (!c) return null
            return (
              <span key={id} className={cn('inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pr-2.5 pl-0.5 text-[12px]', inherited && 'opacity-55')}>
                <Avatar name={c.name} color={c.color} size={18} className="ring-0" />
                {c.name.split(' ')[0]}
              </span>
            )
          })}
          {inherited && <span className="text-[11.5px] text-faint">from {inheritedFrom?.label}</span>}
          <span className="inline-flex items-center gap-1 text-[12px] text-faint group-hover:text-muted">
            <Plus size={13} />
            {shown.length === 0 && placeholder}
          </span>
        </button>
      }
    />
  )
}
