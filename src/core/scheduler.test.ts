import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { applyAnswer, askTier, maxTier, newItemState, startOfDayPlus } from './scheduler.ts'
import type { Answer, Facet, ItemState, Tier } from './types.ts'

const facetArb = fc.constantFrom<Facet>(
  'flag-to-country',
  'country-to-flag',
  'country-to-capital',
  'capital-to-country',
)
const tierArb = fc.constantFrom<Tier>(0, 1, 2, 3)
const start = Date.UTC(2026, 10, 23, 8)

/** A run of answers with times that only move forward. */
const answersArb = fc
  .array(fc.record({ correct: fc.boolean(), tier: tierArb, gap: fc.nat(40 * 86_400_000) }), {
    maxLength: 60,
  })
  .map((steps) => {
    let at = start
    return steps.map(({ correct, tier, gap }): Answer => {
      at += gap
      return { correct, tier, at }
    })
  })

const replay = (facet: Facet, answers: Answer[]) => {
  const states: ItemState[] = [newItemState('fr-x', start)]
  for (const answer of answers) {
    states.push(applyAnswer(states.at(-1) as ItemState, answer, facet))
  }
  return states
}

describe('scheduler invariants', () => {
  it('keeps every box between 1 and 5 and every tier within the facet limit', () => {
    fc.assert(
      fc.property(facetArb, answersArb, (facet, answers) => {
        for (const state of replay(facet, answers)) {
          expect(state.box).toBeGreaterThanOrEqual(1)
          expect(state.box).toBeLessThanOrEqual(5)
          expect(state.tier).toBeGreaterThanOrEqual(0)
          expect(state.tier).toBeLessThanOrEqual(maxTier(facet))
        }
      }),
    )
  })

  it('sends an item back to box 1 after any wrong answer', () => {
    fc.assert(
      fc.property(facetArb, answersArb, (facet, answers) => {
        const states = replay(facet, answers)
        answers.forEach((answer, i) => {
          if (!answer.correct) expect(states[i + 1]?.box).toBe(1)
        })
      }),
    )
  })

  it('never reaches box 3 without a correct answer at T2 or T3', () => {
    fc.assert(
      fc.property(facetArb, answersArb, (facet, answers) => {
        const states = replay(facet, answers)
        answers.forEach((answer, i) => {
          const before = states[i] as ItemState
          const after = states[i + 1] as ItemState
          if (after.box >= 3 && after.box > before.box) {
            expect(answer.correct && answer.tier >= 2).toBe(true)
          }
        })
      }),
    )
  })

  it('only offers typed answers (T3) once an item reaches box 3', () => {
    fc.assert(
      fc.property(facetArb, answersArb, (facet, answers) => {
        for (const state of replay(facet, answers)) {
          if (state.tier === 3) expect(state.box).toBeGreaterThanOrEqual(3)
        }
      }),
    )
  })

  it('moves the tier exactly one step from the format that was asked', () => {
    fc.assert(
      fc.property(facetArb, answersArb, (facet, answers) => {
        const states = replay(facet, answers)
        answers.forEach((answer, i) => {
          const after = states[i + 1] as ItemState
          if (answer.correct) expect(after.tier).toBeLessThanOrEqual(answer.tier + 1)
          else expect(after.tier).toBe(Math.max(0, answer.tier - 1))
        })
      }),
    )
  })

  it('never schedules a review before the answer that set it', () => {
    fc.assert(
      fc.property(facetArb, answersArb, (facet, answers) => {
        const states = replay(facet, answers)
        answers.forEach((answer, i) => {
          expect(states[i + 1]?.dueAt).toBeGreaterThanOrEqual(answer.at)
        })
      }),
    )
  })
})

describe('applyAnswer', () => {
  const fresh = newItemState('td-flag-to-country', start)

  it('moves a correct T0 answer to box 2, due at the start of tomorrow', () => {
    const next = applyAnswer(fresh, { correct: true, tier: 0, at: start }, 'flag-to-country')
    expect(next).toMatchObject({ box: 2, tier: 1, correctCount: 1 })
    expect(next.dueAt).toBe(startOfDayPlus(start, 1))
  })

  it('holds a possible guess at box 2 without demoting a higher box', () => {
    const boxFour: ItemState = { ...fresh, box: 4, tier: 3 }
    const next = applyAnswer(boxFour, { correct: true, tier: 1, at: start }, 'flag-to-country')
    expect(next.box).toBe(4)
  })

  it('promotes a correct T2 answer from box 2 to box 3, due in 3 days', () => {
    const boxTwo: ItemState = { ...fresh, box: 2, tier: 2 }
    const next = applyAnswer(boxTwo, { correct: true, tier: 2, at: start }, 'flag-to-country')
    expect(next.box).toBe(3)
    expect(next.dueAt).toBe(startOfDayPlus(start, 3))
  })

  it('drops a tier and returns to box 1 on a miss, due straight away', () => {
    const boxThree: ItemState = { ...fresh, box: 3, tier: 2 }
    const next = applyAnswer(boxThree, { correct: false, tier: 2, at: start }, 'flag-to-country')
    expect(next).toMatchObject({ box: 1, tier: 1, dueAt: start, wrongCount: 1 })
  })

  it('keeps an item at T1 after any number of right answers at T0', () => {
    let state = fresh
    for (let day = 0; day < 10; day++) {
      state = applyAnswer(
        state,
        { correct: true, tier: 0, at: start + day * 86_400_000 },
        'flag-to-country',
      )
    }
    expect(state).toMatchObject({ box: 2, tier: 1 })
  })

  it('caps country-to-flag at T2', () => {
    const atTwo: ItemState = { ...fresh, box: 3, tier: 2 }
    const next = applyAnswer(atTwo, { correct: true, tier: 2, at: start }, 'country-to-flag')
    expect(next.tier).toBe(2)
  })
})

describe('askTier', () => {
  const base = newItemState('fr-flag-to-country', start)

  it('starts new items at T0', () => {
    expect(askTier(undefined, 'flag-to-country')).toBe(0)
  })

  it('asks at the stored tier but never above what the box allows', () => {
    expect(askTier({ ...base, box: 2, tier: 2 }, 'flag-to-country')).toBe(2)
    expect(askTier({ ...base, box: 2, tier: 3 }, 'flag-to-country')).toBe(2)
    expect(askTier({ ...base, box: 3, tier: 3 }, 'flag-to-country')).toBe(3)
    expect(askTier({ ...base, box: 5, tier: 3 }, 'country-to-flag')).toBe(2)
  })
})
