import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { isCorrect, makeClaimCard, type ClaimCard, type ClaimResponse } from '../core/cards.ts'
import { isFinished, recordAnswer, startSession, type SessionState } from '../core/session.ts'
import type { Random } from '../core/types.ts'
import { flagUrl, type Country } from '../data/countries.ts'
import { useSwipe, type SwipeDirection, type SwipeSource } from './useSwipe.ts'

export type SessionSummary = {
  answered: number
  items: number
  rightFirstTime: number
  missed: Country[]
}

type Props = {
  queue: readonly string[]
  countries: readonly Country[]
  random: Random
  onAnswer: (itemId: string, correct: boolean) => void
  onFinish: (summary: SessionSummary) => void
}

type Phase =
  | { kind: 'question'; card: ClaimCard<Country> }
  | { kind: 'feedback'; card: ClaimCard<Country>; correct: boolean; autoAdvance: boolean }

const responseFor: Record<SwipeDirection, ClaimResponse> = {
  right: 'true',
  left: 'false',
  down: 'unknown',
}

/**
 * A right answer from a real swipe moves on by itself after this long. A miss, or any answer
 * given with a button or key, waits for the learner, so nobody is rushed (WCAG 2.2.1).
 */
const autoAdvanceMs = 900

/** Keys with a modifier belong to the browser, such as Cmd+D to bookmark. */
const hasModifier = (event: KeyboardEvent) => event.metaKey || event.ctrlKey || event.altKey

function summarise(session: SessionState, countries: readonly Country[]): SessionSummary {
  const entries = Object.entries(session.firstAnswers)
  const missed = entries
    .filter(([, correct]) => !correct)
    .map(([id]) => countries.find((c) => c.iso2 === id.slice(0, 2)))
    .filter((c): c is Country => c !== undefined)
  return {
    answered: session.answered,
    items: entries.length,
    rightFirstTime: entries.length - missed.length,
    missed,
  }
}

export function SessionScreen({ queue, countries, random, onAnswer, onFinish }: Props) {
  const [session, setSession] = useState(() => startSession(queue))
  const [phase, setPhase] = useState<Phase>(() => ({
    kind: 'question',
    card: makeClaimCard(queue[0] ?? '', countries, random),
  }))

  const cardRef = useRef<HTMLDivElement>(null)
  const claimId = useId()

  const answer = (direction: SwipeDirection, source: SwipeSource) => {
    if (phase.kind !== 'question') return
    const correct = isCorrect(phase.card, responseFor[direction])
    onAnswer(phase.card.itemId, correct)
    setSession((current) => recordAnswer(current, correct, random))
    setPhase({
      kind: 'feedback',
      card: phase.card,
      correct,
      autoAdvance: correct && source === 'gesture',
    })
  }

  const swipe = useSwipe(answer, phase.kind === 'question')

  const next = useCallback(() => {
    if (phase.kind !== 'feedback') return
    const nextId = session.queue[0]
    if (isFinished(session) || nextId === undefined) {
      onFinish(summarise(session, countries))
      return
    }
    setPhase({ kind: 'question', card: makeClaimCard(nextId, countries, random) })
  }, [phase.kind, session, countries, random, onFinish])

  useEffect(() => {
    if (phase.kind !== 'feedback' || !phase.autoAdvance) return
    const timer = window.setTimeout(next, autoAdvanceMs)
    return () => window.clearTimeout(timer)
  }, [phase, next])

  const { commit } = swipe
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A held key repeats. Without this it would answer cards nobody has looked at.
      if (event.repeat || hasModifier(event)) return
      if (phase.kind === 'question') {
        const direction: SwipeDirection | null =
          event.key === 'ArrowRight'
            ? 'right'
            : event.key === 'ArrowLeft'
              ? 'left'
              : event.key === 'ArrowDown' || event.key.toLowerCase() === 'd'
                ? 'down'
                : null
        if (direction) {
          event.preventDefault()
          commit(direction)
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
  }, [phase.kind, commit, next])

  // Each new card takes focus, so screen readers read it and Tab starts from the card.
  useEffect(() => {
    if (phase.kind === 'question') cardRef.current?.focus({ preventScroll: true })
  }, [phase])

  const total = session.answered + session.queue.length
  const done = session.answered
  const { card } = phase

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
        {phase.kind === 'feedback'
          ? `${phase.correct ? 'Right' : 'Not this time'}. This is the flag of ${card.country.name}.`
          : ''}
      </p>

      {phase.kind === 'question' ? (
        <>
          <div className="deck">
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
            <div
              ref={cardRef}
              tabIndex={-1}
              role="group"
              aria-labelledby={claimId}
              className="swipe-card"
              style={swipe.style}
              data-leaning={swipe.leaning ?? undefined}
              {...swipe.handlers}
            >
              <img
                src={flagUrl(card.country)}
                alt="The flag to identify"
                draggable={false}
                width={320}
                height={240}
              />
              <p className="claim" id={claimId}>
                This is the flag of <strong>{card.claimed.name}</strong>
              </p>
            </div>
            <span
              className={`hint hint-down${swipe.leaning === 'down' ? ' on' : ''}`}
              aria-hidden="true"
            >
              Don&rsquo;t know
            </span>
          </div>
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
          <p className="keys">Keys. Left for false, right for true, down for don&rsquo;t know.</p>
        </>
      ) : (
        <div
          className={`feedback ${phase.correct ? 'right' : 'wrong'}`}
          onClick={(event) => {
            // A tap anywhere on the panel moves on. The Next button handles its own clicks.
            if (!(event.target instanceof HTMLButtonElement)) next()
          }}
        >
          <h2>{phase.correct ? 'Right' : 'Not this time'}</h2>
          <img
            src={flagUrl(card.country)}
            alt={`Flag of ${card.country.name}`}
            width={320}
            height={240}
          />
          <p>
            This is the flag of <strong>{card.country.name}</strong>.
          </p>
          {!card.isTrue && (
            <figure className="compare">
              <img
                src={flagUrl(card.claimed)}
                alt={`Flag of ${card.claimed.name}`}
                width={120}
                height={90}
              />
              <figcaption>{card.claimed.name}&rsquo;s flag, for comparison</figcaption>
            </figure>
          )}
          <button type="button" onClick={next} autoFocus>
            Next
          </button>
        </div>
      )}
    </section>
  )
}
