import { useState, type CSSProperties, type PointerEvent } from 'react'

export type SwipeDirection = 'left' | 'right' | 'down'

type Offset = { x: number; y: number }

/** How far the card must travel, as a share of its size, before a swipe counts. */
const horizontalShare = 0.35
const verticalShare = 0.25
/** The card starts to show which way it is leaning at this share of the threshold. */
const leanShare = 0.4
const flyOutMs = 180

export function directionFor(offset: Offset, width: number, height: number): SwipeDirection | null {
  if (Math.abs(offset.x) >= Math.abs(offset.y)) {
    if (offset.x >= width * horizontalShare) return 'right'
    if (offset.x <= -width * horizontalShare) return 'left'
  } else if (offset.y >= height * verticalShare) {
    return 'down'
  }
  return null
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const flyOut: Record<SwipeDirection, string> = {
  left: 'translate(-120vw, 0) rotate(-20deg)',
  right: 'translate(120vw, 0) rotate(20deg)',
  down: 'translate(0, 120vh)',
}

type Drag = { origin: Offset; offset: Offset; width: number; height: number }

/**
 * Drag a card with a finger, pen or mouse. Pointer Events cover all three, so there is no
 * gesture library. `commit` lets buttons and keys trigger the same fly-out as a swipe.
 */
export function useSwipe(onSwipe: (direction: SwipeDirection) => void, enabled: boolean) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const [leaving, setLeaving] = useState<SwipeDirection | null>(null)

  const commit = (direction: SwipeDirection) => {
    if (leaving) return
    setLeaving(direction)
    window.setTimeout(
      () => {
        setLeaving(null)
        onSwipe(direction)
      },
      prefersReducedMotion() ? 0 : flyOutMs,
    )
  }

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (!enabled || leaving) return
      const card = event.currentTarget
      card.setPointerCapture?.(event.pointerId)
      setDrag({
        origin: { x: event.clientX, y: event.clientY },
        offset: { x: 0, y: 0 },
        width: card.offsetWidth || 300,
        height: card.offsetHeight || 400,
      })
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const { clientX, clientY } = event
      setDrag((current) =>
        current
          ? { ...current, offset: { x: clientX - current.origin.x, y: clientY - current.origin.y } }
          : null,
      )
    },
    onPointerUp() {
      if (!drag) return
      const direction = directionFor(drag.offset, drag.width, drag.height)
      setDrag(null)
      if (direction) commit(direction)
    },
    onPointerCancel() {
      setDrag(null)
    },
  }

  const offset = drag?.offset ?? { x: 0, y: 0 }
  const leaning =
    leaving ??
    (drag
      ? directionFor({ x: offset.x / leanShare, y: offset.y / leanShare }, drag.width, drag.height)
      : null)

  const style: CSSProperties = {
    transform: leaving
      ? flyOut[leaving]
      : `translate(${offset.x}px, ${Math.max(0, offset.y)}px) rotate(${offset.x / 20}deg)`,
    transition: drag ? 'none' : `transform ${flyOutMs}ms ease-out`,
  }

  return { handlers, style, leaning, commit }
}
