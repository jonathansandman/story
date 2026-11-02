import { forwardRef, type ReactNode } from 'react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/cn'

/**
 * The app frame. Nothing outside the middle pane ever scrolls: the top bar,
 * optional sub-bar (e.g. chapter strip) and bottom tabs stay put, so you
 * always know where you are and what you can do — like a native app.
 */
export function Screen({ top, sub, bottom, children, className }: { top?: ReactNode; sub?: ReactNode; bottom?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {top}
      {sub}
      <div className={cn('min-h-0 flex-1', className)}>{children}</div>
      {bottom}
    </div>
  )
}

/** The one scrolling region of a screen. */
export const Scroll = forwardRef<HTMLDivElement, { children: ReactNode; className?: string }>(function Scroll({ children, className }, ref) {
  return (
    <div ref={ref} data-scroll className={cn('h-full overflow-y-auto overscroll-contain', className)}>
      {children}
    </div>
  )
})

export function TopBar({ left, title, right, className }: { left?: ReactNode; title: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center gap-1 border-b border-line bg-bg/95 px-2 pt-[env(safe-area-inset-top,0px)] backdrop-blur sm:px-4',
        'box-content',
        className,
      )}
    >
      {left}
      <div className="min-w-0 flex-1 px-1">{title}</div>
      {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
    </header>
  )
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return <h1 className="truncate font-serif text-[21px] leading-tight tracking-tight text-ink">{children}</h1>
}

export interface TabItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
  badge?: number
}

/** Phone bottom navigation. Desktop uses the rail / top tabs instead. */
export function BottomTabs({ items }: { items: TabItem[] }) {
  return (
    <nav
      className="grid shrink-0 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur lg:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              'relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium [&_svg]:size-[21px]',
              isActive ? 'text-accent' : 'text-faint',
            )
          }
        >
          {t.icon}
          {t.label}
          {!!t.badge && (
            <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-semibold text-accent-ink">
              {t.badge}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

/** Desktop counterpart of BottomTabs, for a top bar. */
export function TopTabs({ items }: { items: TabItem[] }) {
  return (
    <nav className="hidden items-center gap-1 lg:flex">
      {items.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              'relative flex h-9 items-center gap-2 rounded-lg px-3 text-[13.5px] transition-colors [&_svg]:size-[15px]',
              isActive ? 'bg-surface font-medium text-ink shadow-soft' : 'text-muted hover:bg-surface-2 hover:text-ink',
            )
          }
        >
          {t.icon}
          {t.label}
          {!!t.badge && <span className="rounded-full bg-accent px-1.5 text-[10.5px] leading-4 font-semibold text-accent-ink">{t.badge}</span>}
        </NavLink>
      ))}
    </nav>
  )
}
