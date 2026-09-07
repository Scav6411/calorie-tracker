import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const ITEM_WIDTH = 56
const TRACK_HEIGHT = 56

/**
 * Horizontal picker wheel.
 *
 * Native scrolling plus CSS scroll-snap does the work, so momentum and rubber
 * banding feel right on iOS without a gesture library. The selection is
 * whichever item sits under the centre band; onChange fires once scrolling
 * settles rather than on every frame.
 */
export function WheelPicker({
  values,
  value,
  onChange,
  format = String,
  ariaLabel,
  className,
  showBand = true,
}: {
  values: number[]
  value: number
  onChange: (value: number) => void
  format?: (value: number) => string
  ariaLabel: string
  className?: string
  /** Off when several wheels share one band drawn by the parent. */
  showBand?: boolean
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<number | undefined>(undefined)
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, values.indexOf(value)))

  // Position the wheel on the current value when it first appears.
  useEffect(() => {
    const index = values.indexOf(value)
    if (index < 0 || !scrollerRef.current) return
    scrollerRef.current.scrollLeft = index * ITEM_WIDTH
    setActiveIndex(index)
    // Mount only: afterwards the scroller is the source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleScroll() {
    const scroller = scrollerRef.current
    if (!scroller) return

    const index = Math.min(
      values.length - 1,
      Math.max(0, Math.round(scroller.scrollLeft / ITEM_WIDTH)),
    )
    if (index !== activeIndex) setActiveIndex(index)

    window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      if (values[index] !== value) onChange(values[index])
    }, 100)
  }

  // Half a track width of padding lets the first and last item reach the centre.
  const edgePad = `calc(50% - ${ITEM_WIDTH / 2}px)`

  return (
    <div className={cn('relative select-none', className)} style={{ height: TRACK_HEIGHT }}>
      {showBand && (
        <div
          className="border-border/80 bg-muted/40 pointer-events-none absolute top-0 left-1/2 h-full -translate-x-1/2 rounded-lg border"
          style={{ width: ITEM_WIDTH }}
          aria-hidden
        />
      )}

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        role="listbox"
        aria-label={ariaLabel}
        tabIndex={0}
        className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        style={{
          maskImage: 'linear-gradient(to right, transparent, #000 18%, #000 82%, transparent)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent, #000 18%, #000 82%, transparent)',
        }}
      >
        <div className="shrink-0" style={{ width: edgePad }} aria-hidden />
        {values.map((item, index) => {
          const distance = Math.abs(index - activeIndex)
          return (
            <div
              key={item}
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                'flex shrink-0 snap-center items-center justify-center tabular-nums transition-colors',
                index === activeIndex
                  ? 'text-foreground text-2xl font-semibold'
                  : 'text-muted-foreground text-base',
              )}
              style={{
                width: ITEM_WIDTH,
                opacity: distance === 0 ? 1 : Math.max(0.25, 1 - distance * 0.24),
              }}
            >
              {format(item)}
            </div>
          )
        })}
        <div className="shrink-0" style={{ width: edgePad }} aria-hidden />
      </div>
    </div>
  )
}
