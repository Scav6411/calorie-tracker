import { Outlet } from 'react-router-dom'
import { BottomNav } from './bottom-nav'

/**
 * Phone-first frame, sized to exactly one viewport — the app never scrolls
 * vertically, so every screen has to fit inside this box.
 */
export function MobileShell() {
  return (
    <div className="bg-background text-foreground flex h-svh flex-col overflow-hidden">
      <div className="mx-auto flex w-full max-w-md min-h-0 flex-1 flex-col px-5 pt-4">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  )
}
