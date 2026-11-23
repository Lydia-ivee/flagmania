import type { Answer, Box, Facet, ItemState, Tier } from './types.ts'

/** Days until the next review for each box. Box 1 comes back in the same session. */
export const reviewDays: Record<Box, number> = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 21 }

/** Country-to-flag cannot be typed, so it tops out at four options. */
export const maxTier = (facet: Facet): Tier => (facet === 'country-to-flag' ? 2 : 3)

/** Typed answers (T3) are only offered once an item reaches this box. */
const typedFromBox: Box = 3

/** The highest tier an item in this box can be asked at. */
export const tierCap = (facet: Facet, box: Box): Tier =>
  Math.min(maxTier(facet), box < typedFromBox ? 2 : 3) as Tier

/** A correct answer below this tier could be a lucky guess. */
const guessTierLimit = 2
/** The highest box a possible guess can reach. */
const guessBoxLimit: Box = 2

export function newItemState(id: string, now: number): ItemState {
  return { id, box: 1, tier: 0, dueAt: now, lastSeenAt: now, correctCount: 0, wrongCount: 0 }
}

/** Midnight at the start of the local day, plus whole days. Safe across clock changes. */
export function startOfDayPlus(at: number, days: number): number {
  const date = new Date(at)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return date.getTime()
}

export function dueAtFor(box: Box, at: number): number {
  return box === 1 ? at : startOfDayPlus(at, reviewDays[box])
}

export function applyAnswer(state: ItemState, answer: Answer, facet: Facet): ItemState {
  if (!answer.correct) {
    return {
      ...state,
      box: 1,
      // One step easier than the format that was just missed.
      tier: Math.max(0, answer.tier - 1) as Tier,
      dueAt: dueAtFor(1, answer.at),
      lastSeenAt: answer.at,
      wrongCount: state.wrongCount + 1,
    }
  }

  const promoted = Math.min(5, state.box + 1) as Box
  const box =
    answer.tier < guessTierLimit
      ? (Math.max(state.box, Math.min(promoted, guessBoxLimit)) as Box)
      : promoted

  return {
    ...state,
    box,
    // One step harder than the format that was just answered, within what the box allows.
    tier: Math.min(tierCap(facet, box), answer.tier + 1) as Tier,
    dueAt: dueAtFor(box, answer.at),
    lastSeenAt: answer.at,
    correctCount: state.correctCount + 1,
  }
}

export const isDue = (state: ItemState, now: number) => state.dueAt <= now
