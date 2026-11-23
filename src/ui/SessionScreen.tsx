import { useCallback, useEffect, useState } from 'react'
import { isCorrect, makeClaimCard, type ClaimCard, type ClaimResponse } from '../core/cards.ts'
import { isFinished, recordAnswer, startSession, type SessionState } from '../core/session.ts'
import type { Random } from '../core/types.ts'
import { flagUrl, type Country } from '../data/countries.ts'
import { useSwipe, type SwipeDirection } from './useSwipe.ts'

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
  | { kind: 'feedback'; card: ClaimCard<Country>; correct: boolean }

const responseFor: Record<SwipeDirection, ClaimResponse> = {
  right: 'true',
  left: 'false',
  down: 'unknown',
}

/** A right answer moves on by itself after this long. A miss waits for the learner. */
const autoAdvanceMs = 900

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

  const answer = (direction: SwipeDirection) => {
    if (phase.kind !== 'question') return
    const correct = isCorrect(phase.card, responseFor[direction])
    onAnswer(phase.card.itemId, correct)
    setSession((current) => recordAnswer(current, correct, random))
    setPhase({ kind: 'feedback', card: phase.card, correct })
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
    if (phase.kind !== 'feedback' || !phase.correct) return
    const timer = window.setTimeout(next, autoAdvanceMs)
    return () => window.clearTimeout(timer)
  }, [phase, next])

  const { commit } = swipe
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase.kind === 'question') {
        if (event.key === 'ArrowRight') commit('right')
        else if (event.key === 'ArrowLeft') commit('left')
        else if (event.key === 'ArrowDown' || event.key.toLowerCase() === 'd') commit('down')
      } else if (['Enter', ' ', 'ArrowRight'].includes(event.key)) {
        event.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase.kind, commit, next])

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

      {phase.kind === 'question' ? (
        <>
          <div className="deck">
            <span className={`hint hint-left${swipe.leaning === 'left' ? ' on' : ''}`}>False</span>
            <span className={`hint hint-right${swipe.leaning === 'right' ? ' on' : ''}`}>True</span>
            <div
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
              <p className="claim">
                This is the flag of <strong>{card.claimed.name}</strong>
              </p>
            </div>
            <span className={`hint hint-down${swipe.leaning === 'down' ? ' on' : ''}`}>
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
          role="status"
          onClick={next}
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
