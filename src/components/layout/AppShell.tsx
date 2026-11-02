import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { BookOpen, Menu as MenuIcon, Moon, Plus, Search, Settings, Sun, SunMoon, Users, Wand2, X } from 'lucide-react'
import { useAi } from '@/features/ai/ai-context'
import { useStories } from '@/db/hooks'
import { createStory } from '@/db/repo'
import { cn } from '@/lib/cn'
import { useTheme, type Theme } from '@/lib/theme'
import { Kbd } from '@/components/ui/primitives'
import { CommandPalette } from '@/features/search/CommandPalette'

export function AppShell() {
  const { openImport } = useAi()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setNavOpen(false), [location.pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-bg/90 px-3 backdrop-blur lg:hidden">
        <button className="rounded-lg p-2 text-muted hover:bg-surface-2" onClick={() => setNavOpen(true)} aria-label="Open navigation">
          <MenuIcon size={18} />
        </button>
        <Brand />
        <button className="ml-auto rounded-lg p-2 text-muted hover:bg-surface-2" onClick={openImport} aria-label="Import AI reply" title="Import AI reply">
          <Wand2 size={18} />
        </button>
        <button className="rounded-lg p-2 text-muted hover:bg-surface-2" onClick={() => setPaletteOpen(true)} aria-label="Search">
          <Search size={18} />
        </button>
      </div>

      {navOpen && <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setNavOpen(false)} />}
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} onSearch={() => setPaletteOpen(true)} />

      <main className="min-w-0 flex-1 overflow-y-auto pt-12 lg:pt-0">
        <Outlet />
      </main>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}

function Brand() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-ink">
        <svg viewBox="0 0 32 32" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M9 7v18M16 7v18M23 7v18M6 12h20M6 20h20" />
        </svg>
      </span>
      <span className="font-serif text-[18px] font-medium tracking-tight text-ink">Trellis</span>
    </span>
  )
}

function Sidebar({ open, onClose, onSearch }: { open: boolean; onClose: () => void; onSearch: () => void }) {
  const stories = useStories()
  const { openImport } = useAi()
  const navigate = useNavigate()
  const [theme, setTheme] = useTheme()

  const newStory = async () => {
    const s = await createStory({ title: '' })
    navigate(`/stories/${s.id}/bible`)
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-[260px] shrink-0 flex-col border-r border-line bg-surface-2/60 backdrop-blur transition-transform duration-200 lg:static lg:translate-x-0 lg:bg-surface-2/40',
        open ? 'translate-x-0 bg-surface' : '-translate-x-full',
      )}
    >
      <div className="flex h-14 items-center justify-between px-4">
        <Brand />
        <button className="rounded-lg p-1.5 text-faint hover:bg-surface-3 lg:hidden" onClick={onClose} aria-label="Close navigation">
          <X size={16} />
        </button>
      </div>

      <div className="px-3">
        <button
          onClick={onSearch}
          className="flex h-8 w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-faint shadow-soft transition-colors hover:border-line-strong"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search everything</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>

      <nav className="mt-4 space-y-0.5 px-3">
        <NavItem to="/" icon={<BookOpen />} end>
          Stories
        </NavItem>
        <NavItem to="/characters" icon={<Users />}>
          Characters
        </NavItem>
        <button
          onClick={() => {
            onClose()
            openImport()
          }}
          className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] text-muted transition-colors hover:bg-surface-3/60 hover:text-ink [&_svg]:size-[15px]"
        >
          <Wand2 /> Import AI reply
        </button>
      </nav>

      <div className="mt-6 flex items-center justify-between px-5">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">Your stories</span>
        <button onClick={newStory} className="rounded-md p-1 text-faint hover:bg-surface-3 hover:text-ink" title="New story" aria-label="New story">
          <Plus size={14} />
        </button>
      </div>
      <div className="mt-1.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {stories?.map((s) => (
          <NavLink
            key={s.id}
            to={`/stories/${s.id}`}
            className={({ isActive }) =>
              cn(
                'block truncate rounded-lg px-2.5 py-1.5 font-serif text-[14.5px] transition-colors',
                isActive ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:bg-surface-3/60 hover:text-ink',
              )
            }
          >
            {s.title || 'Untitled story'}
          </NavLink>
        ))}
      </div>

      <div className="flex items-center gap-1 border-t border-line px-3 py-2.5">
        <NavItem to="/settings" icon={<Settings />} className="flex-1">
          Settings
        </NavItem>
        <ThemeButton theme={theme} setTheme={setTheme} />
      </div>
    </aside>
  )
}

function NavItem({ to, icon, children, end, className }: { to: string; icon: React.ReactNode; children: React.ReactNode; end?: boolean; className?: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors [&_svg]:size-[15px]',
          isActive ? 'bg-surface font-medium text-ink shadow-soft' : 'text-muted hover:bg-surface-3/60 hover:text-ink',
          className,
        )
      }
    >
      {icon}
      {children}
    </NavLink>
  )
}

function ThemeButton({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : SunMoon
  return (
    <button
      onClick={() => setTheme(next[theme])}
      className="rounded-lg p-2 text-faint hover:bg-surface-3/60 hover:text-ink"
      title={`Theme: ${theme}`}
      aria-label={`Theme: ${theme}. Click to change.`}
    >
      <Icon size={15} />
    </button>
  )
}
