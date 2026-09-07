import { NavLink, useLocation } from 'react-router-dom'
import { ChartNoAxesColumn, House } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'

export function BottomNav() {
  const { session } = useAuth()
  const { pathname } = useLocation()
  const demo = pathname.startsWith('/demo')

  if (!session && !demo) return null

  const tabs = [
    { to: demo ? '/demo' : '/', label: 'Home', icon: House, end: true },
    { to: demo ? '/demo/trends' : '/trends', label: 'Trends', icon: ChartNoAxesColumn, end: false },
  ]

  return (
    <nav className="border-border/60 bg-background shrink-0 border-t">
      <div className="mx-auto flex w-full max-w-md items-stretch pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                isActive ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <tab.icon className={cn('size-5', isActive && 'stroke-[2.4]')} aria-hidden />
                {tab.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
