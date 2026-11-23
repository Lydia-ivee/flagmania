import { describe, expect, it } from 'vitest'
import { isCorrect, makeClaimCard } from './cards.ts'
import { seeded } from './random.ts'

const countries = [
  { iso2: 'td', name: 'Chad', region: 'Africa' },
  { iso2: 'ml', name: 'Mali', region: 'Africa' },
  { iso2: 'ro', name: 'Romania', region: 'Europe' },
  { iso2: 'fj', name: 'Fiji', region: 'Oceania' },
]

describe('makeClaimCard', () => {
  it('makes true claims about half the time', () => {
    const random = seeded(7)
    const cards = Array.from({ length: 1000 }, () =>
      makeClaimCard('td-flag-to-country', countries, random),
    )
    const share = cards.filter((c) => c.isTrue).length / cards.length
    expect(share).toBeGreaterThan(0.45)
    expect(share).toBeLessThan(0.55)
  })

  it('names a different country from the same region in a false claim', () => {
    const random = seeded(8)
    for (let i = 0; i < 100; i++) {
      const card = makeClaimCard('td-flag-to-country', countries, random)
      if (!card.isTrue) expect(card.claimed.iso2).toBe('ml')
    }
  })

  it('falls back to any other country when a region has only one', () => {
    const random = seeded(9)
    for (let i = 0; i < 100; i++) {
      const card = makeClaimCard('fj-flag-to-country', countries, random)
      if (!card.isTrue) expect(card.claimed.iso2).not.toBe('fj')
    }
  })
})

describe('isCorrect', () => {
  const trueCard = makeClaimCard('td-flag-to-country', countries, () => 0)
  const falseCard = makeClaimCard('td-flag-to-country', countries, () => 0.9)

  it('marks responses against the claim', () => {
    expect(trueCard.isTrue).toBe(true)
    expect(falseCard.isTrue).toBe(false)
    expect(isCorrect(trueCard, 'true')).toBe(true)
    expect(isCorrect(trueCard, 'false')).toBe(false)
    expect(isCorrect(falseCard, 'false')).toBe(true)
  })

  it('treats "don\'t know" as wrong', () => {
    expect(isCorrect(trueCard, 'unknown')).toBe(false)
    expect(isCorrect(falseCard, 'unknown')).toBe(false)
  })
})
