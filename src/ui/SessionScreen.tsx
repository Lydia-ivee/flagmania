import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  checkTypedCard,
  isChoiceCorrect,
  isClaimCorrect,
  makeCard,
  type Card,
} from '../core/cards.ts'
import { isFinished, recordAnswer, startSession, type SessionState } from '../core/session.ts'
import type { Random, Tier } from '../core/types.ts'
import { flagUrl, type Country } from '../data/countries.ts'
import { lookalikesOf } from '../data/lookalikes.ts'
import { announcement, Feedback, type Given } from './CardViews.tsx'
import { QuestionView } from './QuestionView.tsx'
import type { SwipeSource } from './useSwipe.ts'

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
      ambiguous: boolean
      autoAdvance: boolean
    }

/**
 * A right answer from a real swipe moves on by itself after this long. A miss, or any answer
 * given with a button or key, waits for the learner, so nobody is rushed (WCAG 2.2.1).
 */
const autoAdvanceMs = 900

/** Keys with a modifier belong to the browser, such as Cmd+D to bookmark. */
const hasModifier = (event: KeyboardEvent) => event.metaKey || event.ctrlKey || event.altKey

/** Starts downloading flags so they are ready when a card shows them. */
function preloadFlags(countries: readonly Country[]) {
  for (const country of countries) {
    const image = new Image()
    image.src = flagUrl(country)
  }
}

/** Every flag a card can show, on the question or the feedback screen. */
function flagsOn(card: Card<Country>): Country[] {
  if (card.kind === 'claim') return [card.country, card.claimed.country]
  if (card.kind === 'choice') return card.options.map((o) => o.country)
  return [card.country]
}

type Mark = { correct: boolean; exact: boolean; ambiguous: boolean }

function mark(card: Card, given: Given): Mark {
  if (card.kind === 'claim' && given.kind === 'claim') {
    const correct = isClaimCorrect(card, given.value)
    return { correct, exact: correct, ambiguous: false }
  }
  if (card.kind === 'choice' && given.kind === 'choice') {
    const correct = isChoiceCorrect(card, given.index)
    return { correct, exact: correct, ambiguous: false }
  }
  if (card.kind === 'typed' && given.kind === 'typed' && given.text !== null) {
    return checkTypedCard(card, given.text)
  }
  return { correct: false, exact: false, ambiguous: false }
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

  // Load every flag the session will ask about, so no card shows an empty frame on a slow
  // connection. Option flags for each next card are loaded while its feedback is on screen.
  useEffect(() => {
    preloadFlags(
      queue
        .map((id) => countries.find((c) => c.iso2 === id.slice(0, 2)))
        .filter((c): c is Country => c !== undefined),
    )
  }, [queue, countries])

  const answer = (given: Given, source: SwipeSource) => {
    if (phase.kind !== 'question') return
    const { correct, exact, ambiguous } = mark(phase.card, given)
    onAnswer(phase.card.itemId, correct, phase.card.tier)
    setSession((current) => recordAnswer(current, correct, random))
    setPhase({
      kind: 'feedback',
      card: phase.card,
      given,
      correct,
      exact,
      ambiguous,
      autoAdvance: correct && source === 'gesture',
    })
  }

  // The next card is built as soon as the feedback shows, from progress that already includes
  // this answer, so its flags can load while the learner reads.
  const buildRef = useRef(build)
  const prepared = useRef<Card<Country> | null>(null)
  useEffect(() => {
    buildRef.current = build
  })
  useEffect(() => {
    prepared.current = null
    const nextId = session.queue[0]
    if (phase.kind !== 'feedback' || nextId === undefined) return
    const card = buildRef.current(nextId)
    prepared.current = card
    preloadFlags(flagsOn(card))
  }, [phase, session.queue])

  const next = useCallback(() => {
    if (phase.kind !== 'feedback') return
    const nextId = session.queue[0]
    if (isFinished(session) || nextId === undefined) {
      onFinish(summarise(session, countries))
      return
    }
    const ready = prepared.current?.itemId === nextId ? prepared.current : null
    setPhase({ kind: 'question', card: ready ?? build(nextId) })
  }, [phase.kind, session, countries, build, onFinish])

  // The timer reads the latest `next` through a ref, so a re-render does not restart it.
  const nextRef = useRef(next)
  useEffect(() => {
    nextRef.current = next
  })
  useEffect(() => {
    if (phase.kind !== 'feedback' || !phase.autoAdvance) return
    const timer = window.setTimeout(() => nextRef.current(), autoAdvanceMs)
    return () => window.clearTimeout(timer)
  }, [phase])

  // Keys on the feedback screen. Question keys live in QuestionView. A layout effect, so the
  // listener is in place before the screen paints and no key press falls in a gap.
  useLayoutEffect(() => {
    if (phase.kind !== 'feedback') return
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || hasModifier(event)) return
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
  }, [phase.kind, next])

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
        {phase.kind === 'feedback' ? announcement(card, phase.correct) : ''}
      </p>

      {phase.kind === 'question' ? (
        // Keyed per appearance, so each card starts with fresh swipe state.
        <QuestionView key={session.answered} card={card} onAnswer={answer} />
      ) : (
        <Feedback
          card={card}
          given={phase.given}
          correct={phase.correct}
          exact={phase.exact}
          ambiguous={phase.ambiguous}
          onNext={next}
        />
      )}
    </section>
  )
}
