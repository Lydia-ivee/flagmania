import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import type { Card } from '../core/cards.ts'
import type { Country } from '../data/countries.ts'
import { ChoicePad, optionDirections, Prompt, TypedAnswer, type Given } from './CardViews.tsx'
import { useSwipe, type SwipeDirection, type SwipeSource } from './useSwipe.ts'

type Props = {
  card: Card<Country>
  onAnswer: (given: Given, source: SwipeSource) => void
}

const keyDirections: Record<string, SwipeDirection> = {
  ArrowUp: 'up',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'down',
}

/** Keys with a modifier belong to the browser, such as Cmd+D to bookmark. */
const hasModifier = (event: KeyboardEvent) => event.metaKey || event.ctrlKey || event.altKey

const keyHints: Record<string, string> = {
  claim: 'Keys. Left for false, right for true, down or D for don’t know.',
  choice2: 'Keys. Left or right to pick, down or D for don’t know.',
  choice4: 'Keys. Arrows to pick, D for don’t know.',
  typed: 'Type the answer and press Enter.',
}

/** Directions a card can be swiped in. Claims and two options use down for "don't know". */
function swipeDirections(card: Card): SwipeDirection[] {
  if (card.kind === 'claim') return ['left', 'right', 'down']
  if (card.kind === 'choice') {
    return card.options.length === 2 ? ['left', 'right', 'down'] : optionDirections(4)
  }
  return []
}

/** Turns a swipe into an answer for this card. */
function givenFor(card: Card, direction: SwipeDirection): Given | null {
  if (card.kind === 'claim') {
    const value = direction === 'right' ? 'true' : direction === 'left' ? 'false' : 'unknown'
    return { kind: 'claim', value }
  }
  if (card.kind === 'choice') {
    const index = optionDirections(card.options.length).indexOf(direction)
    return { kind: 'choice', index: index === -1 ? null : index }
  }
  return null
}

/**
 * One question. The session renders a fresh one for every card (it is keyed by card), so no
 * drag, fly-out or lock can carry over from the card before.
 */
export function QuestionView({ card, onAnswer }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const claimId = useId()
  const directions = swipeDirections(card)

  const swipe = useSwipe(
    (direction, source) => {
      const given = givenFor(card, direction)
      if (given) onAnswer(given, source)
    },
    directions.length > 0,
    directions,
  )
  const { commit, lock } = swipe

  /**
   * "Don't know" without a swipe, for four-option and typed cards. It takes the same lock as a
   * swipe, so whichever input comes first is the answer.
   */
  const dontKnow = () => {
    if (card.kind === 'choice' && card.options.length === 4) {
      if (lock()) onAnswer({ kind: 'choice', index: null }, 'command')
    } else if (card.kind === 'typed') {
      if (lock()) onAnswer({ kind: 'typed', text: null }, 'command')
    } else {
      commit('down')
    }
  }

  const submitTyped = (text: string) => {
    if (lock()) onAnswer({ kind: 'typed', text }, 'command')
  }

  // A layout effect, so the listener is ready before the card paints.
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A held key repeats. Without this it would answer cards nobody has looked at.
      if (event.repeat || hasModifier(event)) return
      // Typing an answer must never trigger a shortcut.
      if (event.target instanceof HTMLInputElement) return
      const direction = keyDirections[event.key]
      if (direction && directions.includes(direction)) {
        event.preventDefault()
        commit(direction)
      } else if (event.key.toLowerCase() === 'd') {
        dontKnow()
      } else if (event.key.startsWith('Arrow')) {
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // The card takes focus so screen readers read it and Tab starts from it. Typed cards focus
  // their input instead.
  useEffect(() => {
    if (card.kind !== 'typed') cardRef.current?.focus({ preventScroll: true })
  }, [card])

  const hintKey =
    card.kind === 'choice'
      ? `choice${card.options.length}`
      : card.kind === 'claim'
        ? 'claim'
        : 'typed'
  const swipeable = card.kind !== 'typed'

  return (
    <>
      <div className="deck">
        {card.kind === 'claim' && (
          <>
            <span
              className={`hint hint-left${swipe.leaning === 'left' ? ' on' : ''}`}
              aria-hidden="true"
            >
              False
            </span>
            <span
              className={`hint hint-right${swipe.leaning === 'right' ? ' on' : ''}`}
              aria-hidden="true"
            >
              True
            </span>
          </>
        )}
        <div
          ref={cardRef}
          tabIndex={-1}
          role="group"
          aria-labelledby={`${titleId} ${claimId}`}
          className={`swipe-card kind-${card.kind}`}
          style={swipeable ? swipe.style : undefined}
          data-leaning={swipe.leaning ?? undefined}
          {...(swipeable ? swipe.handlers : {})}
        >
          <Prompt card={card} titleId={titleId} claimId={claimId} />
        </div>
      </div>

      {card.kind === 'claim' && (
        <div className="answer-buttons">
          <button
            type="button"
            className={`false${swipe.leaning === 'left' ? ' on' : ''}`}
            onClick={() => commit('left')}
          >
            False
          </button>
          <button
            type="button"
            className={`unknown${swipe.leaning === 'down' ? ' on' : ''}`}
            onClick={() => commit('down')}
          >
            Don&rsquo;t know
          </button>
          <button
            type="button"
            className={`true${swipe.leaning === 'right' ? ' on' : ''}`}
            onClick={() => commit('right')}
          >
            True
          </button>
        </div>
      )}

      {card.kind === 'choice' && (
        <>
          <ChoicePad card={card} leaning={swipe.leaning} onPick={commit} />
          <button
            type="button"
            className={`unknown skip${
              card.options.length === 2 && swipe.leaning === 'down' ? ' on' : ''
            }`}
            onClick={dontKnow}
          >
            Don&rsquo;t know
          </button>
        </>
      )}

      {card.kind === 'typed' && (
        <TypedAnswer
          label={card.facet === 'country-to-capital' ? 'Capital' : 'Country'}
          onSubmit={submitTyped}
          onSkip={dontKnow}
        />
      )}

      <p className="keys">{keyHints[hintKey]}</p>
    </>
  )
}
