import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'

export type SwipeDirection = 'up' | 'left' | 'right' | 'down'

/** A gesture is a real drag. A command is a button press or a key. */
export type SwipeSource = 'gesture' | 'command'

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
  } else if (offset.y <= -height * verticalShare) {
    return 'up'
  }
  return null
}

export const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const flyOut: Record<SwipeDirection, string> = {
  left: 'translate(-120vw, 0) rotate(-20deg)',
  right: 'translate(120vw, 0) rotate(20deg)',
  down: 'translate(0, 120vh)',
  up: 'translate(0, -120vh)',
}

type Drag = { pointerId: number; origin: Offset; offset: Offset; width: number; height: number }

/**
 * Drag a card with a finger, pen or mouse. Pointer Events cover all three, so there is no
 * gesture library. `commit` lets buttons and keys trigger the same fly-out as a swipe.
 *
 * Use one hook per card (key the component by card), so a drag or fly-out never carries over.
 */
export function useSwipe(
  onSwipe: (direction: SwipeDirection, source: SwipeSource) => void,
  enabled: boolean,
  allowed: readonly SwipeDirection[] = ['left', 'right', 'down'],
) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const [leaving, setLeaving] = useState<SwipeDirection | null>(null)
  // Set at once, unlike state, so two inputs in the same moment cannot both get through.
  const locked = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  /** A swipe in a direction the card does not use springs back. */
  const usable = (direction: SwipeDirection | null) =>
    direction && allowed.includes(direction) ? direction : null

  /** Takes the card's one answer. False when an earlier input already has it. */
  const lock = () => {
    if (locked.current) return false
    locked.current = true
    return true
  }

  const commit = (direction: SwipeDirection, source: SwipeSource = 'command') => {
    // `enabled` covers swiping only. Typed cards cannot be swiped but still take the lock.
    if (!enabled || !lock()) return
    setDrag(null)
    setLeaving(direction)
    timer.current = window.setTimeout(
      () => onSwipe(direction, source),
      prefersReducedMotion() ? 0 : flyOutMs,
    )
  }

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (!enabled || locked.current || !event.isPrimary) return
      const card = event.currentTarget
      card.setPointerCapture?.(event.pointerId)
      setDrag({
        pointerId: event.pointerId,
        origin: { x: event.clientX, y: event.clientY },
        offset: { x: 0, y: 0 },
        width: card.offsetWidth || 300,
        height: card.offsetHeight || 400,
      })
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const { clientX, clientY, pointerId } = event
      setDrag((current) =>
        current && current.pointerId === pointerId
          ? { ...current, offset: { x: clientX - current.origin.x, y: clientY - current.origin.y } }
          : current,
      )
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      if (!drag || event.pointerId !== drag.pointerId) return
      // Measure from the release point itself. The last move may not have rendered yet.
      const offset = { x: event.clientX - drag.origin.x, y: event.clientY - drag.origin.y }
      setDrag(null)
      const direction = usable(directionFor(offset, drag.width, drag.height))
      if (direction) commit(direction, 'gesture')
    },
    onPointerCancel() {
      setDrag(null)
    },
  }

  const offset = drag?.offset ?? { x: 0, y: 0 }
  const leaning =
    leaving ??
    (drag
      ? usable(
          directionFor(
            { x: offset.x / leanShare, y: offset.y / leanShare },
            drag.width,
            drag.height,
          ),
        )
      : null)

  const style: CSSProperties = {
    transform: leaving
      ? flyOut[leaving]
      : `translate(${offset.x}px, ${allowed.includes('up') ? offset.y : Math.max(0, offset.y)}px) rotate(${offset.x / 20}deg)`,
    // Reduced motion skips the spring-back and fly-out animations as well as the delay.
    transition: drag || prefersReducedMotion() ? 'none' : `transform ${flyOutMs}ms ease-out`,
  }

  return { handlers, style, leaning, commit, lock }
}
