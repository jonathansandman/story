import { useState } from 'react'
import { AlertTriangle, BookOpen, ChevronDown, CornerDownRight, Heart, Layers, MessageSquare, User } from 'lucide-react'
import type { BeatChange, FieldChange, Plan, PlannedChange } from '@/ai/plan'
import { cn } from '@/lib/cn'
import { Tick } from '@/components/ui/primitives'

const ICON = { story: BookOpen, character: User, relationship: Heart, chapter: Layers }

/**
 * Review an AI reply as a set of choices. Every item — down to individual
 * beats — can be ticked or unticked; optional suggestions start unticked.
 */
export function ImportPreview({
  plan,
  warnings,
  selected,
  onChange,
}: {
  plan: Plan
  warnings: string[]
  selected: Set<string>
  onChange: (s: Set<string>) => void
}) {
  const set = (mutate: (s: Set<string>) => void) => {
    const next = new Set(selected)
    mutate(next)
    onChange(next)
  }
  const toggleChange = (c: PlannedChange) =>
    set((s) => {
      const on = !s.has(c.key)
      if (on) s.add(c.key)
      else s.delete(c.key)
      // A chapter's beats follow the chapter.
      for (const b of c.beats ?? []) if (on && b.defaultOn) s.add(b.key)
      else if (!on) s.delete(b.key)
    })
  const toggleBeat = (c: PlannedChange, b: BeatChange) =>
    set((s) => {
      if (s.has(b.key)) s.delete(b.key)
      else {
        s.add(b.key)
        s.add(c.key) // ticking a beat ticks its chapter
      }
    })
  const setAllBeats = (c: PlannedChange, on: boolean) =>
    set((s) => {
      for (const b of c.beats ?? []) if (on) s.add(b.key)
      else s.delete(b.key)
      if (on) s.add(c.key)
    })

  const optionalCount = plan.changes.reduce((n, c) => n + (c.beats ?? []).filter((b) => !b.defaultOn).length + (c.defaultOn ? 0 : 1), 0)

  return (
    <div className="space-y-4">
      {plan.notes && (
        <div className="flex gap-3 rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-muted">
          <MessageSquare size={15} className="mt-0.5 shrink-0 text-faint" />
          <p className="whitespace-pre-line">{plan.notes}</p>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="space-y-1 rounded-xl bg-warn/10 px-4 py-3 ring-1 ring-warn/30">
          {warnings.map((w, i) => (
            <p key={i} className="flex gap-2 text-[12.5px] text-ink">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" /> {w}
            </p>
          ))}
        </div>
      )}
      <p className="text-[12.5px] text-faint">
        Tick what you want{optionalCount ? ` — ${optionalCount} suggestion${optionalCount === 1 ? ' starts' : 's start'} unticked` : ''}. Tap an item to read it in full. A snapshot is taken first, so you can undo from Settings.
      </p>
      <ul className="space-y-2.5">
        {plan.changes.map((c) => (
          <ChangeRow
            key={c.key}
            change={c}
            on={!!c.required || selected.has(c.key)}
            selected={selected}
            onToggle={() => !c.required && toggleChange(c)}
            onToggleBeat={(b) => toggleBeat(c, b)}
            onAllBeats={(on) => setAllBeats(c, on)}
          />
        ))}
      </ul>
    </div>
  )
}

function ChangeRow({
  change: c,
  on,
  selected,
  onToggle,
  onToggleBeat,
  onAllBeats,
}: {
  change: PlannedChange
  on: boolean
  selected: Set<string>
  onToggle: () => void
  onToggleBeat: (b: BeatChange) => void
  onAllBeats: (on: boolean) => void
}) {
  const hasBeats = !!c.beats?.length
  const [open, setOpen] = useState(hasBeats || (c.op === 'update' && c.fields.length <= 3))
  const Icon = ICON[c.group]
  const beatsOn = (c.beats ?? []).filter((b) => selected.has(b.key)).length

  return (
    <li className={cn('rounded-2xl border bg-surface transition-opacity', on ? 'border-line' : 'border-dashed border-line opacity-60')}>
      <div className="flex items-start gap-3 px-4 py-3">
        <button onClick={onToggle} disabled={c.required} aria-pressed={on} aria-label={on ? 'Exclude' : 'Include'} className={cn(c.required && 'opacity-60')}>
          <Tick on={on} />
        </button>
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)}>
          <div className="flex flex-wrap items-center gap-2">
            <Icon size={14} className="text-faint" />
            <Badge op={c.op} optional={!c.defaultOn} />
            <span className="font-serif text-[15.5px] text-ink">{c.title}</span>
          </div>
          {c.subtitle && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted">{c.subtitle}</p>}
          {c.position && <Position text={c.position} />}
          {c.why && <p className="mt-1 text-[12px] text-faint italic">{c.why}</p>}
          {hasBeats && (
            <p className="mt-0.5 text-[11.5px] text-faint">
              {beatsOn} of {c.beats!.length} beat change{c.beats!.length === 1 ? '' : 's'} selected
            </p>
          )}
        </button>
        <ChevronDown size={15} className={cn('mt-1 shrink-0 cursor-pointer text-faint transition-transform', open && 'rotate-180')} onClick={() => setOpen((o) => !o)} />
      </div>

      {open && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          <Fields fields={c.fields} isNew={c.op === 'create'} />
          {hasBeats && (
            <>
              {c.beats!.length > 2 && (
                <div className="flex gap-3 text-[12px]">
                  <button className="text-accent hover:underline" onClick={() => onAllBeats(true)}>
                    Select all
                  </button>
                  <button className="text-muted hover:underline" onClick={() => onAllBeats(false)}>
                    None
                  </button>
                </div>
              )}
              <ul className="space-y-2">
                {c.beats!.map((b) => (
                  <BeatRow key={b.key} beat={b} on={selected.has(b.key)} onToggle={() => onToggleBeat(b)} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </li>
  )
}

function BeatRow({ beat: b, on, onToggle }: { beat: BeatChange; on: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false)
  const desc = b.op === 'create' ? b.row.description : undefined
  return (
    <li
      className={cn(
        'rounded-xl px-3 py-2.5 transition-colors',
        b.op === 'delete' ? 'bg-[#b4443c]/8' : on ? 'bg-accent-soft/40 ring-1 ring-accent/20' : 'bg-surface-2/60',
      )}
    >
      <div className="flex items-start gap-2.5">
        <button onClick={onToggle} aria-pressed={on} aria-label={on ? 'Exclude beat' : 'Include beat'}>
          <Tick on={on} />
        </button>
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)}>
          <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
            <Badge op={b.op} optional={!b.defaultOn} small />
            <span className="font-medium text-ink">{b.title}</span>
          </div>
          {b.position && <Position text={b.position} />}
          {desc && <p className={cn('mt-1 text-[13px] leading-snug text-muted', !open && 'line-clamp-2')}>{desc}</p>}
          {b.why && <p className="mt-1 text-[12px] text-faint italic">{b.why}</p>}
          {b.hasProse && <p className="mt-1 text-[11.5px] font-medium text-[#b4443c]">Has written prose — it will be deleted</p>}
        </button>
      </div>
      {open && b.op !== 'delete' && (
        <div className="mt-2 pl-7">
          <Fields fields={b.op === 'create' ? b.fields.filter((f) => f.label !== 'What happens') : b.fields} isNew={b.op === 'create'} expanded />
        </div>
      )}
    </li>
  )
}

function Badge({ op, optional, small }: { op: 'create' | 'update' | 'delete'; optional?: boolean; small?: boolean }) {
  const label = op === 'create' ? (optional ? 'Idea' : 'New') : op === 'delete' ? 'Delete' : 'Edit'
  return (
    <span
      className={cn(
        'rounded font-semibold tracking-wide uppercase',
        small ? 'px-1.5 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-[10.5px]',
        op === 'create' ? (optional ? 'bg-surface-3 text-muted' : 'bg-ok/12 text-ok') : op === 'delete' ? 'bg-[#b4443c]/15 text-[#b4443c]' : 'bg-accent-soft text-accent',
      )}
    >
      {label}
    </span>
  )
}

function Position({ text }: { text: string }) {
  return (
    <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-faint">
      <CornerDownRight size={11} /> {text}
    </p>
  )
}

function Fields({ fields, isNew, expanded }: { fields: FieldChange[]; isNew: boolean; expanded?: boolean }) {
  if (!fields.length) return null
  return (
    <dl className="space-y-2">
      {fields.map((f, i) => (
        <FieldRow key={i} f={f} isNew={isNew} expanded={expanded} />
      ))}
    </dl>
  )
}

function FieldRow({ f, isNew, expanded }: { f: FieldChange; isNew: boolean; expanded?: boolean }) {
  const [open, setOpen] = useState(!!expanded)
  const long = f.after.length + f.before.length > 220
  return (
    <div className="text-[12.5px] leading-snug" onClick={() => long && setOpen((o) => !o)}>
      <dt className="font-medium text-muted">{f.label}</dt>
      <dd className={cn(!open && long && 'line-clamp-3', long && 'cursor-pointer')}>
        {!isNew && f.before && <span className="mr-1.5 text-faint line-through decoration-faint/60">{f.before}</span>}
        <span className="text-ink">{f.after || <em className="text-faint">(cleared)</em>}</span>
      </dd>
    </div>
  )
}
