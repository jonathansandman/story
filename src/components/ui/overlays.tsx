import * as RDialog from '@radix-ui/react-dialog'
import * as RMenu from '@radix-ui/react-dropdown-menu'
import * as RPopover from '@radix-ui/react-popover'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/cn'

/* ───────────── Dialog ───────────── */

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  hideHeader,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
  hideHeader?: boolean
}) {
  useHistoryDismiss(open, () => onOpenChange(false))
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-[#1a1512]/30 backdrop-blur-[2px] animate-fade-in dark:bg-black/50" />
        <RDialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[min(88vh,900px)] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-2xl border border-line bg-surface shadow-lift outline-none animate-rise',
            className,
          )}
          aria-describedby={description ? undefined : undefined}
        >
          {hideHeader ? (
            <RDialog.Title className="sr-only">{title}</RDialog.Title>
          ) : (
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
              <div>
                <RDialog.Title className="font-serif text-[19px] text-ink">{title}</RDialog.Title>
                {description && <RDialog.Description className="mt-0.5 text-[13px] text-muted">{description}</RDialog.Description>}
              </div>
              <RDialog.Close className="-mr-2 rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-ink" aria-label="Close">
                <X size={16} />
              </RDialog.Close>
            </div>
          )}
          {!description && <RDialog.Description className="sr-only">{title}</RDialog.Description>}
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}

/* ───────────── Confirm ───────────── */

export function useConfirm() {
  const [state, setState] = useState<{ title: string; body?: string; action: string; resolve: (v: boolean) => void } | null>(null)
  const confirm = useCallback(
    (title: string, opts: { body?: string; action?: string } = {}) =>
      new Promise<boolean>((resolve) => setState({ title, body: opts.body, action: opts.action ?? 'Delete', resolve })),
    [],
  )
  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  const element = (
    <Dialog open={!!state} onOpenChange={(o) => !o && close(false)} title={state?.title ?? ''} hideHeader>
      <div className="p-6">
        <h2 className="font-serif text-[19px]">{state?.title}</h2>
        {state?.body && <p className="mt-2 text-[13.5px] text-muted">{state.body}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button className="h-8.5 rounded-lg px-3.5 text-[13px] text-muted hover:bg-surface-2" onClick={() => close(false)}>
            Cancel
          </button>
          <button
            autoFocus
            className="h-8.5 rounded-lg bg-[#b4443c] px-3.5 text-[13px] font-medium text-white hover:bg-[#9f3a33]"
            onClick={() => close(true)}
          >
            {state?.action}
          </button>
        </div>
      </div>
    </Dialog>
  )
  return { confirm, element }
}

/* ───────────── Dropdown menu ───────────── */

export const Menu = RMenu.Root
export const MenuTrigger = RMenu.Trigger

export function MenuContent({ children, align = 'end' }: { children: ReactNode; align?: 'start' | 'end' | 'center' }) {
  return (
    <RMenu.Portal>
      <RMenu.Content
        align={align}
        sideOffset={6}
        className="z-50 min-w-48 rounded-xl border border-line bg-surface p-1 shadow-lift animate-rise"
      >
        {children}
      </RMenu.Content>
    </RMenu.Portal>
  )
}

export function MenuItem({
  children,
  onSelect,
  icon,
  danger,
  checked,
}: {
  children: ReactNode
  onSelect?: () => void
  icon?: ReactNode
  danger?: boolean
  checked?: boolean
}) {
  return (
    <RMenu.Item
      onSelect={onSelect}
      className={cn(
        'flex h-8 cursor-default items-center gap-2.5 rounded-lg px-2.5 text-[13px] outline-none select-none [&_svg]:size-[15px]',
        danger ? 'text-[#b4443c] data-[highlighted]:bg-[#b4443c]/10' : 'text-ink data-[highlighted]:bg-surface-2',
      )}
    >
      {icon && <span className="text-faint">{icon}</span>}
      <span className="flex-1">{children}</span>
      {checked && <Check className="text-accent" />}
    </RMenu.Item>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <RMenu.Label className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-faint uppercase">{children}</RMenu.Label>
}

export function MenuSeparator() {
  return <RMenu.Separator className="my-1 h-px bg-line" />
}

/* ───────────── Popover ───────────── */

export const Popover = RPopover.Root
export const PopoverTrigger = RPopover.Trigger

export function PopoverContent({ children, className, align = 'start' }: { children: ReactNode; className?: string; align?: 'start' | 'end' | 'center' }) {
  return (
    <RPopover.Portal>
      <RPopover.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-lift outline-none animate-rise', className)}
      >
        {children}
      </RPopover.Content>
    </RPopover.Portal>
  )
}

/* ───────────── Toasts ───────────── */

export interface ToastAction {
  label: string
  run: () => void | Promise<void>
}

interface Toast {
  id: number
  title: string
  detail?: string
  action?: ToastAction
}

type ToastFn = (title: string, detail?: string, opts?: { action?: ToastAction }) => void
const ToastContext = createContext<ToastFn>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

/**
 * Toasts sit at the top so they never cover the action you just tapped.
 * A toast with an action (Undo) stays longer and can be tapped.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback<ToastFn>(
    (title, detail, opts) => {
      const id = ++seq.current
      setToasts((t) => [...t.slice(-1), { id, title, detail, action: opts?.action }])
      setTimeout(() => dismiss(id), opts?.action ? 6000 : 2600)
    },
    [dismiss],
  )
  const value = useMemo(() => push, [push])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top,0px)+10px)]"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-[min(92vw,460px)] items-center gap-3 rounded-xl bg-ink py-2 pr-2 pl-4 text-[13.5px] text-bg shadow-lift animate-rise"
          >
            <Check size={15} className="shrink-0 text-accent-soft" />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{t.title}</span>
              {t.detail && <span className="ml-2 opacity-60">{t.detail}</span>}
            </span>
            {t.action ? (
              <button
                onClick={async () => {
                  dismiss(t.id)
                  await t.action!.run()
                }}
                className="h-9 shrink-0 rounded-lg px-3 font-semibold text-accent-soft hover:bg-white/10"
              >
                {t.action.label}
              </button>
            ) : (
              <span className="w-2" />
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/* ───────────── Back closes overlays ───────────── */

/**
 * While an overlay is open, push a history entry so the phone's Back gesture
 * closes the overlay instead of leaving the page. Closing it any other way
 * pops that entry again. The push is deferred a tick so React StrictMode's
 * double-mount in development doesn't leave stray entries.
 */
export function useHistoryDismiss(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const marker = `o${Math.random().toString(36).slice(2)}`
    let pushed = false
    let popped = false
    const onPop = () => {
      popped = true
      closeRef.current()
    }
    const t = setTimeout(() => {
      window.history.pushState({ ...(window.history.state ?? {}), __overlay: marker }, '')
      pushed = true
      window.addEventListener('popstate', onPop)
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('popstate', onPop)
      if (pushed && !popped && (window.history.state as { __overlay?: string } | null)?.__overlay === marker) window.history.back()
    }
  }, [open])
}

/* ───────────── Sheet ───────────── */

/**
 * A bottom sheet on phones (thumb-reachable, swipe-free dismiss via Back or
 * the scrim) and an anchored panel on desktop.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  children: ReactNode
  className?: string
}) {
  useHistoryDismiss(open, () => onOpenChange(false))
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-[#1a1512]/30 animate-fade-in dark:bg-black/50" />
        <RDialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-2xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom,0px)] shadow-lift outline-none animate-rise',
            'lg:inset-x-auto lg:top-16 lg:right-4 lg:bottom-auto lg:w-[400px] lg:rounded-2xl lg:border',
            className,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line-strong lg:hidden" />
          <RDialog.Title className="sr-only">{title}</RDialog.Title>
          <RDialog.Description className="sr-only">{title}</RDialog.Description>
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}
