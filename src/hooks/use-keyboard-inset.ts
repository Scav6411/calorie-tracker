import { useEffect, useState } from 'react'

/**
 * Height currently covered by the on-screen keyboard, in pixels.
 *
 * A `fixed bottom-0` sheet stays pinned to the layout viewport, which iOS does
 * not shrink when the keyboard opens - so the bottom of the sheet ends up
 * behind the keyboard. visualViewport reports the actually-visible area, and
 * the difference is how far the sheet has to be lifted.
 */
export function useKeyboardInset() {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const update = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop
      // Ignore sub-pixel noise and the browser's own collapsing toolbars.
      setInset(covered > 80 ? Math.round(covered) : 0)
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
