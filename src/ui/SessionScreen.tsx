import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  checkTypedCard,
  isChoiceCorrect,
  isClaimCorrect,
  makeCard,
  type Card,
} from '../core/cards.ts'
import { isFinished, recordAnswer, startSession, type SessionState } from '../core/session.ts'
import type { Random, Tier } from '../core/types.ts'
import type { Country } from '../data/countries.ts'
import { lookalikesOf } from '../data/lookalikes.ts'
import {
  announcement,
  ChoicePad,
  Feedback,
  optionDirections,
  Prompt,
  TypedAnswer,
  type Given,
} from './CardViews.tsx'
import { useSwipe, type SwipeDirection, type SwipeSource } from './useSwipe.ts'

export type SessionSummary = {
  answered: number
  items: number
  rightFirstTime: number
  missed: { itemId: string; country: Country }[]
}

type Props = {
  queue: readonly string[]
  countries: readonly Country[]
  random: Random
  /** The format to ask this item in, from its saved progress. */
  tierFor: (itemId: string) => Tier
  onAnswer: (itemId: string, correct: boolean, tier: Tier) => void
  onFinish: (summary: SessionSummary) => void
}

type Phase =
  | { kind: 'question'; card: Card<Country> }
  | {
      kind: 'feedback'
      card: Card<Country>
      given: Given
      correct: boolean
      exact: boolean
      autoAdvance: boolean
    }

/**
 * A right answer from a real swipe moves on by itself after this long. A miss, or any answer
 * given with a button or key, waits for the learner, so nobody is rushed (WCAG 2.2.1).
 */
const autoAdvanceMs = 900

/** Keys with a modifier belong to the browser, such as Cmd+D to bookmark. */
const hasModifier = (event: KeyboardEvent) => event.metaKey || event.ctrlKey || event.altKey

const keyDirections: Record<string, SwipeDirection> = {
  ArrowUp: 'up',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'down',
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

function mark(card: Card, given: Given): { correct: boolean; exact: boolean } {
  if (card.kind === 'claim' && given.kind === 'claim') {
    const correct = isClaimCorrect(card, given.value)
    return { correct, exact: correct }
  }
  if (card.kind === 'choice' && given.kind === 'choice') {
    const correct = isChoiceCorrect(card, given.index)
    return { correct, exact: correct }
  }
  if (card.kind === 'typed' && given.kind === 'typed' && given.text !== null) {
    return checkTypedCard(card, given.text)
  }
  return { correct: false, exact: false }
}

function summarise(session: SessionState, countries: readonly Country[]): SessionSummary {
  const entries = Object.entries(session.firstAnswers)
  const missed = entries
    .filter(([, correct]) => !correct)
    .map(([itemId]) => ({ itemId, country: countries.find((c) => c.iso2 === itemId.slice(0, 2)) }))
    .filter((m): m is { itemId: string; country: Country } => m.country !== undefined)
  return {
    answered: session.answered,
    items: entries.length,
    rightFirstTime: entries.length - missed.length,
    missed,
  }
}

const keyHints: Record<string, string> = {
  claim: 'Keys. Left for false, right for true, down or D for don’t know.',
  choice2: 'Keys. Left or right to pick, down or D for don’t know.',
  choice4: 'Keys. Arrows to pick, D for don’t know.',
  typed: 'Type the answer and press Enter.',
}

export function SessionScreen({ queue, countries, random, tierFor, onAnswer, onFinish }: Props) {
  const build = useCallback(
    (itemId: string) => makeCard(itemId, tierFor(itemId), countries, random, { lookalikesOf }),
    [tierFor, countries, random],
  )
  const [session, setSession] = useState(() => startSession(queue))
  const [phase, setPhase] = useState<Phase>(() => ({
    kind: 'question',
    card: build(queue[0] ?? ''),
  }))
  const cardRef = useRef<HTMLDivElement>(null)
  const claimId = useId()

  const answer = (given: Given, source: SwipeSource) => {
    if (phase.kind !== 'question') return
    const { correct, exact } = mark(phase.card, given)
    onAnswer(phase.card.itemId, correct, phase.card.tier)
    setSession((current) => recordAnswer(current, correct, random))
    setPhase({
      kind: 'feedback',
      card: phase.card,
      given,
      correct,
      exact,
      autoAdvance: correct && source === 'gesture',
    })
  }

  const onSwipe = (direction: SwipeDirection, source: SwipeSource) => {
    if (phase.kind !== 'question') return
    const given = givenFor(phase.card, direction)
    if (given) answer(given, source)
  }

  const directions = phase.kind === 'question' ? swipeDirections(phase.card) : []
  const swipe = useSwipe(onSwipe, phase.kind === 'question' && directions.length > 0, directions)
  const { commit } = swipe

  /** "Don't know" without a swipe, for four-option and typed cards. */
  const dontKnow = () => {
    if (phase.kind !== 'question') return
    const { card } = phase
    if (card.kind === 'choice' && card.options.length === 4) {
      answer({ kind: 'choice', index: null }, 'command')
    } else if (card.kind === 'typed') {
      answer({ kind: 'typed', text: null }, 'command')
    } else {
      commit('down')
    }
  }

  const next = useCallback(() => {
    if (phase.kind !== 'feedback') return
    const nextId = session.queue[0]
    if (isFinished(session) || nextId === undefined) {
      onFinish(summarise(session, countries))
      return
    }
    setPhase({ kind: 'question', card: build(nextId) })
  }, [phase.kind, session, countries, build, onFinish])

  useEffect(() => {
    if (phase.kind !== 'feedback' || !phase.autoAdvance) return
    const timer = window.setTimeout(next, autoAdvanceMs)
    return () => window.clearTimeout(timer)
  }, [phase, next])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A held key repeats. Without this it would answer cards nobody has looked at.
      if (event.repeat || hasModifier(event)) return
      // Typing an answer must never trigger a shortcut.
      if (event.target instanceof HTMLInputElement) return

      if (phase.kind === 'question') {
        const direction = keyDirections[event.key]
        if (direction && directions.includes(direction)) {
          event.preventDefault()
          commit(direction)
        } else if (event.key.toLowerCase() === 'd') {
          dontKnow()
        } else if (event.key.startsWith('Arrow')) {
          event.preventDefault()
        }
        return
      }
      // Enter or Space on a focused button already clicks it, so leave those to the button.
      const onButton = event.target instanceof HTMLButtonElement
      if (onButton && (event.key === 'Enter' || event.key === ' ')) return
      if (['Enter', ' ', 'ArrowRight'].includes(event.key)) {
        event.preventDefault()
        next()
      } else if (event.key.startsWith('Arrow')) {
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Each new card takes focus, so screen readers read it and Tab starts from the card.
  // Typed cards focus their input instead.
  useEffect(() => {
    if (phase.kind === 'question' && phase.card.kind !== 'typed') {
      cardRef.current?.focus({ preventScroll: true })
    }
  }, [phase])

  const total = session.answered + session.queue.length
  const done = session.answered
  const { card } = phase
  const hintKey =
    card.kind === 'choice'
      ? `choice${card.options.length}`
      : card.kind === 'claim'
        ? 'claim'
        : 'typed'
  const swipeable = card.kind !== 'typed'

  return (
    <section className="session" aria-label="Study session">
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label="Session progress"
      >
        <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>

      {/* Always mounted, so screen readers announce each result as its text changes. */}
      <p className="visually-hidden" aria-live="polite">
        {phase.kind === 'feedback' ? announcement(card, phase.correct) : ''}
      </p>

      {phase.kind === 'question' ? (
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
              aria-labelledby={claimId}
              className={`swipe-card kind-${card.kind}`}
              style={swipeable ? swipe.style : undefined}
              data-leaning={swipe.leaning ?? undefined}
              {...(swipeable ? swipe.handlers : {})}
            >
              <Prompt card={card} claimId={claimId} />
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
              key={`${card.itemId}-${session.answered}`}
              label={card.facet === 'country-to-capital' ? 'Capital' : 'Country'}
              onSubmit={(text) => answer({ kind: 'typed', text }, 'command')}
              onSkip={dontKnow}
            />
          )}

          <p className="keys">{keyHints[hintKey]}</p>
        </>
      ) : (
        <Feedback
          card={card}
          given={phase.given}
          correct={phase.correct}
          exact={phase.exact}
          onNext={next}
        />
      )}
    </section>
  )
}
