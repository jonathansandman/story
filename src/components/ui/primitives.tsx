import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/text'

/* ───────────── Button ───────────── */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'icon' | 'icon-sm'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover shadow-soft',
  secondary: 'bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-2 shadow-soft',
  subtle: 'bg-surface-2 text-ink hover:bg-surface-3',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2',
  danger: 'text-[#b4443c] hover:bg-[#b4443c]/10',
}
const sizes: Record<Size, string> = {
  // Phones get ≥40–44px targets; pointer devices keep the compact sizes.
  sm: 'h-7 px-2.5 text-[12.5px] gap-1.5 rounded-md max-lg:h-10 max-lg:px-3.5 max-lg:text-[14px]',
  md: 'h-8.5 px-3.5 text-[13px] gap-2 rounded-lg max-lg:h-11 max-lg:px-4 max-lg:text-[15px]',
  icon: 'h-8 w-8 rounded-lg justify-center max-lg:h-11 max-lg:w-11',
  'icon-sm': 'h-6.5 w-6.5 rounded-md justify-center max-lg:h-10 max-lg:w-10',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center font-medium whitespace-nowrap transition-colors duration-150 select-none',
        'disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[15px] [&_svg]:shrink-0',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
})

/* ───────────── Draft-backed inputs ───────────── */

/**
 * Keeps a local draft while the user types and commits (debounced, and on
 * blur) to the database. External changes flow back in when not focused.
 * This avoids caret jumps from the async live-query round trip.
 */
export function useDraft<T>(value: T, commit: (v: T) => void, delay = 350) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ draft, value, commit })
  latest.current = { draft, value, commit }

  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const { draft: d, value: v, commit: c } = latest.current
    if (d !== v) c(d)
  }

  useEffect(() => () => flush(), []) // commit pending edits on unmount

  return {
    value: draft,
    onChange: (v: T) => {
      setDraft(v)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, delay)
    },
    onFocus: () => {
      focused.current = true
    },
    onBlur: () => {
      focused.current = false
      flush()
    },
  }
}

/** Inline-editable text: a dashed underline says "you can type here" without a full box. */
const quietField =
  'w-full bg-transparent outline-none transition-colors duration-150 rounded-none ' +
  'border-0 border-b border-dashed border-line-strong focus:border-solid focus:border-accent py-1'

const boxedField =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 outline-none transition-colors ' +
  'hover:border-line-strong focus:border-accent/60 focus:ring-3 focus:ring-accent/10'

interface TextInputProps {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  className?: string
  variant?: 'quiet' | 'boxed'
  autoFocus?: boolean
  'aria-label'?: string
  inputMode?: 'text' | 'numeric' | 'decimal' | 'search'
}

export function TextInput({ value, onCommit, className, variant = 'boxed', ...rest }: TextInputProps) {
  const d = useDraft(value, onCommit)
  return (
    <input
      {...rest}
      value={d.value}
      onChange={(e) => d.onChange(e.target.value)}
      onFocus={d.onFocus}
      onBlur={d.onBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      className={cn(variant === 'quiet' ? quietField : boxedField, className)}
    />
  )
}

interface TextAreaProps extends TextInputProps {
  minRows?: number
}

/** Auto-growing textarea — long character sheets never get a scroll-box-in-a-scroll-box. */
export function TextArea({ value, onCommit, className, variant = 'boxed', minRows = 2, ...rest }: TextAreaProps) {
  const d = useDraft(value, onCommit)
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [d.value])
  return (
    <textarea
      {...rest}
      ref={ref}
      rows={minRows}
      value={d.value}
      onChange={(e) => d.onChange(e.target.value)}
      onFocus={d.onFocus}
      onBlur={d.onBlur}
      className={cn(variant === 'quiet' ? quietField : boxedField, 'resize-none leading-relaxed', className)}
    />
  )
}

/* ───────────── Field wrapper ───────────── */

export function Field({
  label,
  hint,
  children,
  className,
  aside,
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  className?: string
  aside?: ReactNode
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-medium text-ink">{label}</span>
        {aside}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] leading-snug text-faint">{hint}</span>}
    </label>
  )
}

/* ───────────── Avatar ───────────── */

export function Avatar({ name, color, size = 28, className }: { name: string; color: string; size?: number; className?: string }) {
  return (
    <span
      title={name}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white ring-2 ring-surface', className)}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  )
}

export function AvatarStack({ people, size = 22, max = 4 }: { people: { id: string; name: string; color: string }[]; size?: number; max?: number }) {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <span className="flex -space-x-1.5">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} color={p.color} size={size} />
      ))}
      {rest > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-surface-3 text-muted ring-2 ring-surface"
          style={{ width: size, height: size, fontSize: size * 0.4 }}
        >
          +{rest}
        </span>
      )}
    </span>
  )
}

/* ───────────── Chip ───────────── */

export function Chip({ children, className, onRemove }: { children: ReactNode; className?: string; onRemove?: () => void }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-full bg-surface-2 px-2.5 text-[12px] text-muted', className)}>
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} className="-mr-1 ml-0.5 rounded-full px-1 text-faint hover:text-ink" aria-label="Remove">
          ×
        </button>
      )}
    </span>
  )
}

/* ───────────── Tag input ───────────── */

export function TagInput({ value, onChange, placeholder = 'Add tag…' }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const t = draft.trim().replace(/,$/, '')
    if (t && !value.includes(t)) onChange([...value, t])
    setDraft('')
  }
  return (
    <div className={cn(boxedField, 'flex flex-wrap items-center gap-1.5 py-1.5')}>
      {value.map((t) => (
        <Chip key={t} onRemove={() => onChange(value.filter((x) => x !== t))}>
          {t}
        </Chip>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add()
          } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
        }}
        placeholder={value.length ? '' : placeholder}
        className="min-w-24 flex-1 bg-transparent py-0.5 outline-none"
      />
    </div>
  )
}

/* ───────────── Segmented control ───────────── */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; title?: string }[]
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" className="inline-flex rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md font-medium transition-all duration-150',
            size === 'sm' ? 'h-6 px-2 text-[11.5px] max-lg:h-9 max-lg:px-3 max-lg:text-[13px]' : 'h-7 px-3 text-[12.5px] max-lg:h-10 max-lg:px-3.5 max-lg:text-[14px]',
            value === o.value ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ───────────── Switch ───────────── */

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-start gap-3 rounded-lg px-2 py-1.5 -mx-2 text-left hover:bg-surface-2"
    >
      <span
        className={cn(
          'relative mt-0.5 h-4.5 w-8 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-accent' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200',
            checked && 'translate-x-3.5',
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] text-ink">{label}</span>
        {hint && <span className="block text-[12px] leading-snug text-faint">{hint}</span>}
      </span>
    </button>
  )
}

/* ───────────── Misc ───────────── */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface px-1 font-sans text-[11px] text-faint">
      {children}
    </kbd>
  )
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-8 py-14 text-center">
      {icon && <div className="mb-4 text-faint [&_svg]:size-7">{icon}</div>}
      <h3 className="font-serif text-xl text-ink">{title}</h3>
      {children && <p className="mt-2 max-w-sm text-[13.5px] text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function SectionHeading({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="text-[11.5px] font-semibold tracking-[0.08em] text-faint uppercase">{children}</h2>
      {aside}
    </div>
  )
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  'aria-label': ariaLabel,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  className?: string
  'aria-label'?: string
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(boxedField, 'h-9 appearance-none py-0 pr-8', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1978c' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/** Checkbox visual used in pick lists. */
export function Tick({ on }: { on: boolean }) {
  return (
    <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors', on ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong bg-surface')}>
      {on && <Check size={12} strokeWidth={3} />}
    </span>
  )
}
