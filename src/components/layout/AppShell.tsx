import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { BookOpen, Moon, Search, Settings, Sparkles, Sun, SunMoon, Users, Wand2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useTheme, type Theme } from '@/lib/theme'
import { Button } from '@/components/ui/primitives'
import { CommandPalette } from '@/features/search/CommandPalette'
import { AssistantButton, PendingBanner, type AssistantAction } from '@/features/ai/Assistant'
import { useAi } from '@/features/ai/ai-context'
import { BottomTabs, Screen, ScreenTitle, TopBar } from './Screen'

const SearchCtx = createContext<() => void>(() => {})
export const useOpenSearch = () => useContext(SearchCtx)

/**
 * Root frame. Desktop: a slim icon rail + the current screen. Phone: just
 * the screen; each screen brings its own top bar and bottom tabs, so the
 * frame never scrolls.
 */
export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false)

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
    <SearchCtx.Provider value={() => setPaletteOpen(true)}>
      <div className="flex h-full overflow-hidden">
        <Rail onSearch={() => setPaletteOpen(true)} />
        <main className="h-full min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </SearchCtx.Provider>
  )
}

export function Brand({ small }: { small?: boolean }) {
  return (
    <span className={cn('flex items-center justify-center rounded-lg bg-accent text-accent-ink', small ? 'h-8 w-8' : 'h-9 w-9')}>
      <svg viewBox="0 0 32 32" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
        <path d="M9 7v18M16 7v18M23 7v18M6 12h20M6 20h20" />
      </svg>
    </span>
  )
}

function Rail({ onSearch }: { onSearch: () => void }) {
  const [theme, setTheme] = useTheme()
  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : SunMoon
  const item = (to: string, label: string, icon: ReactNode, end?: boolean) => (
    <NavLink
      to={to}
      end={end}
      title={label}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          'flex h-11 w-11 items-center justify-center rounded-xl transition-colors [&_svg]:size-[19px]',
          isActive ? 'bg-surface text-ink shadow-soft' : 'text-faint hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      {icon}
    </NavLink>
  )
  return (
    <aside className="hidden h-full w-16 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface-2/50 py-3 lg:flex">
      <NavLink to="/" aria-label="Trellis home" className="mb-3">
        <Brand />
      </NavLink>
      {item('/', 'Stories', <BookOpen />, true)}
      {item('/characters', 'Characters', <Users />)}
      <button onClick={onSearch} title="Search (⌘K)" aria-label="Search" className="flex h-11 w-11 items-center justify-center rounded-xl text-faint hover:bg-surface-2 hover:text-ink">
        <Search size={19} />
      </button>
      <div className="flex-1" />
      <button onClick={() => setTheme(next[theme])} title={`Theme: ${theme}`} aria-label={`Theme: ${theme}`} className="flex h-11 w-11 items-center justify-center rounded-xl text-faint hover:bg-surface-2 hover:text-ink">
        <ThemeIcon size={19} />
      </button>
      {item('/settings', 'Settings', <Settings />)}
    </aside>
  )
}

/** Standard screen for the library level (Stories, Characters, Settings…). */
export function LibraryScreen({
  title,
  actions,
  ai = [],
  left,
  menu,
  children,
  tabs = true,
}: {
  title: ReactNode
  actions?: ReactNode
  /** The ⋯ menu; always rendered last. */
  menu?: ReactNode
  ai?: AssistantAction[]
  left?: ReactNode
  children: ReactNode
  tabs?: boolean
}) {
  const openSearch = useOpenSearch()
  const navigate = useNavigate()
  const { openAi } = useAi()
  const defaultAi: AssistantAction[] = [
    { icon: <Wand2 />, label: 'New story with AI', run: () => navigate('/new') },
    { icon: <Sparkles />, label: 'New character with AI', run: () => openAi({ kind: 'new-character' }) },
  ]
  return (
    <Screen
      top={
        <TopBar
          left={left}
          title={typeof title === 'string' ? <ScreenTitle>{title}</ScreenTitle> : title}
          right={
            <>
              {actions}
              <Button variant="ghost" size="icon" onClick={openSearch} aria-label="Search" className="lg:hidden">
                <Search />
              </Button>
              <AssistantButton actions={[...ai, ...defaultAi]} />
              {menu}
            </>
          }
        />
      }
      sub={<PendingBanner />}
      bottom={
        tabs ? (
          <BottomTabs
            items={[
              { to: '/', label: 'Stories', icon: <BookOpen />, end: true },
              { to: '/characters', label: 'Characters', icon: <Users /> },
              { to: '/settings', label: 'Settings', icon: <Settings /> },
            ]}
          />
        ) : undefined
      }
    >
      {children}
    </Screen>
  )
}
