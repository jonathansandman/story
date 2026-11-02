import { useState } from 'react'
import { AlertTriangle, BookOpen, Check, ChevronDown, Heart, Layers, MessageSquare, User } from 'lucide-react'
import type { FieldChange, Plan, PlannedChange } from '@/ai/plan'
import { cn } from '@/lib/cn'

const ICON = { story: BookOpen, character: User, relationship: Heart, chapter: Layers }

/** Review every change an AI reply would make, with per-item opt-out. */
export function ImportPreview({ plan, warnings, selected, onToggle }: { plan: Plan; warnings: string[]; selected: Set<string>; onToggle: (key: string) => void }) {
  return (
    <div className="space-y-4">
      {plan.notes && (
        <div className="flex gap-3 rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-muted">
          <MessageSquare size={15} className="mt-0.5 shrink-0 text-faint" />
          <p className="whitespace-pre-line">{plan.notes}</p>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-xl bg-warn/10 px-4 py-3 ring-1 ring-warn/30">
          {warnings.map((w, i) => (
            <p key={i} className="flex gap-2 text-[12.5px] text-ink">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" /> {w}
            </p>
          ))}
        </div>
      )}
      <p className="text-[12.5px] text-faint">Untick anything you don’t want. A snapshot is taken first, so you can undo the whole import from Settings.</p>
      <ul className="space-y-2">
        {plan.changes.map((c) => (
          <ChangeRow key={c.key} change={c} on={c.required || selected.has(c.key)} onToggle={() => !c.required && onToggle(c.key)} />
        ))}
      </ul>
    </div>
  )
}

function ChangeRow({ change: c, on, onToggle }: { change: PlannedChange; on: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(c.op === 'update' && c.fields.length <= 3)
  const Icon = ICON[c.group]
  const beatCounts = c.beats && {
    create: c.beats.filter((b) => b.op === 'create').length,
    update: c.beats.filter((b) => b.op === 'update').length,
    delete: c.beats.filter((b) => b.op === 'delete').length,
  }
  const detail = [
    c.fields.length ? `${c.fields.length} field${c.fields.length === 1 ? '' : 's'}` : '',
    beatCounts?.create ? `+${beatCounts.create} beat${beatCounts.create === 1 ? '' : 's'}` : '',
    beatCounts?.update ? `${beatCounts.update} beat${beatCounts.update === 1 ? '' : 's'} edited` : '',
    beatCounts?.delete ? `−${beatCounts.delete} beat${beatCounts.delete === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li className={cn('rounded-2xl border bg-surface transition-opacity', on ? 'border-line' : 'border-dashed border-line opacity-55')}>
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          onClick={onToggle}
          disabled={c.required}
          aria-pressed={on}
          aria-label={on ? 'Exclude' : 'Include'}
          className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border', on ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong', c.required && 'opacity-60')}
        >
          {on && <Check size={12} strokeWidth={3} />}
        </button>
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)}>
          <div className="flex flex-wrap items-center gap-2">
            <Icon size={14} className="text-faint" />
            <span className={cn('rounded px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide uppercase', c.op === 'create' ? 'bg-ok/12 text-ok' : 'bg-accent-soft text-accent')}>
              {c.op === 'create' ? 'New' : 'Update'}
            </span>
            <span className="font-serif text-[15.5px] text-ink">{c.title}</span>
          </div>
          {c.subtitle && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted">{c.subtitle}</p>}
          {detail && <p className="mt-0.5 text-[11.5px] text-faint">{detail}</p>}
        </button>
        <ChevronDown size={15} className={cn('mt-1 shrink-0 text-faint transition-transform', open && 'rotate-180')} onClick={() => setOpen((o) => !o)} />
      </div>

      {open && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          <Fields fields={c.fields} isNew={c.op === 'create'} />
          {c.beats && c.beats.length > 0 && (
            <ul className="space-y-2">
              {c.beats.map((b, i) => (
                <li key={i} className={cn('rounded-xl px-3 py-2', b.op === 'delete' ? 'bg-[#b4443c]/8' : 'bg-surface-2/60')}>
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                        b.op === 'create' ? 'bg-ok/12 text-ok' : b.op === 'delete' ? 'bg-[#b4443c]/15 text-[#b4443c]' : 'bg-accent-soft text-accent',
                      )}
                    >
                      {b.op === 'create' ? 'New beat' : b.op === 'delete' ? 'Delete' : 'Edit'}
                    </span>
                    <span className="text-ink">{b.title}</span>
                    {b.hasProse && <span className="text-[11.5px] font-medium text-[#b4443c]">has written prose — it will be deleted</span>}
                  </div>
                  {b.op !== 'delete' && <Fields fields={b.fields} isNew={b.op === 'create'} compact />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

function Fields({ fields, isNew, compact }: { fields: FieldChange[]; isNew: boolean; compact?: boolean }) {
  if (!fields.length) return null
  return (
    <dl className={cn('space-y-1.5', compact && 'mt-1.5')}>
      {fields.map((f, i) => (
        <div key={i} className="text-[12.5px] leading-snug">
          <dt className="font-medium text-muted">{f.label}</dt>
          <dd>
            {!isNew && f.before && <span className="mr-1.5 text-faint line-through decoration-faint/60">{f.before}</span>}
            <span className="text-ink">{f.after || <em className="text-faint">(cleared)</em>}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}
