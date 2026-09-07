import type { ReactNode } from 'react'

/** Layout wrapper: heading block on the left, optional action on the right. */
export function ScreenHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-4">
      {children}
      {action}
    </header>
  )
}

export function ScreenTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{eyebrow}</p>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
    </div>
  )
}
