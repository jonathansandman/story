import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn('mx-auto w-full px-4 py-8 sm:px-8 lg:py-12', wide ? 'max-w-[1400px]' : 'max-w-5xl', className)}>{children}</div>
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[11.5px] font-semibold tracking-[0.08em] text-faint uppercase">{eyebrow}</div>}
        <h1 className="font-serif text-[34px] leading-tight tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1.5 max-w-xl text-[14px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}
