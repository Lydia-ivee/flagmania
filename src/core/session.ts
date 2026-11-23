import { shuffle } from './random.ts'
import { isDue } from './scheduler.ts'
import type { ItemState, Random } from './types.ts'

export type SessionOptions = {
  /** Most cards to start a session with, before any repeats. */
  length: number
  /** Most never-seen items to add to one session. */
  newPerSession: number
}

export const defaultSessionOptions: SessionOptions = { length: 20, newPerSession: 8 }

/** How many times a missed item can come back within one session. */
export const maxRepeats = 3

/**
 * Picks the items for a session. Due items come first, most overdue first. New items fill
 * any space left, up to the cap. The result is shuffled so regions do not bunch together.
 */
export function buildSession(
  catalogue: readonly string[],
  states: ReadonlyMap<string, ItemState>,
  now: number,
  options: SessionOptions,
  random: Random,
): string[] {
  const due = catalogue
    .map((id) => states.get(id))
    .filter((state): state is ItemState => state !== undefined && isDue(state, now))
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, options.length)
    .map((state) => state.id)

  const space = Math.min(options.newPerSession, options.length - due.length)
  const fresh = shuffle(
    catalogue.filter((id) => !states.has(id)),
    random,
  ).slice(0, Math.max(0, space))

  return shuffle([...due, ...fresh], random)
}

export type SessionState = {
  queue: readonly string[]
  answered: number
  /** The first answer given to each item this session. */
  firstAnswers: Readonly<Record<string, boolean>>
  repeats: Readonly<Record<string, number>>
}

export function startSession(queue: readonly string[]): SessionState {
  return { queue, answered: 0, firstAnswers: {}, repeats: {} }
}

/**
 * Removes the current card. A missed card goes back 3 to 5 places later, or to the end
 * when fewer cards remain, until it has repeated maxRepeats times.
 */
export function recordAnswer(
  session: SessionState,
  correct: boolean,
  random: Random,
): SessionState {
  const [current, ...rest] = session.queue
  if (current === undefined) return session

  const firstAnswers =
    current in session.firstAnswers
      ? session.firstAnswers
      : { ...session.firstAnswers, [current]: correct }

  const repeatsSoFar = session.repeats[current] ?? 0
  let queue = rest
  let repeats = session.repeats
  if (!correct && repeatsSoFar < maxRepeats) {
    const gap = 3 + Math.floor(random() * 3)
    const position = Math.min(gap, rest.length)
    queue = [...rest.slice(0, position), current, ...rest.slice(position)]
    repeats = { ...repeats, [current]: repeatsSoFar + 1 }
  }

  return { queue, answered: session.answered + 1, firstAnswers, repeats }
}

export const isFinished = (session: SessionState) => session.queue.length === 0
