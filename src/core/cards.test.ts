import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  capitalGivesAway,
  checkTypedCard,
  isChoiceCorrect,
  isClaimCorrect,
  makeCard,
  pickDistractors,
  rightAnswers,
  type Card,
} from './cards.ts'
import { itemId } from './items.ts'
import { seeded } from './random.ts'
import type { CountryLike, Facet, Tier } from './types.ts'

const country = (
  iso2: string,
  name: string,
  region: string,
  capitals: string[],
  extra: Partial<CountryLike> = {},
): CountryLike => ({ iso2, name, region, capitals, altNames: [], capitalAltNames: [], ...extra })

const countries = [
  country('td', 'Chad', 'Africa', ["N'Djamena"]),
  country('ml', 'Mali', 'Africa', ['Bamako']),
  country('sn', 'Senegal', 'Africa', ['Dakar']),
  country('ng', 'Nigeria', 'Africa', ['Abuja']),
  country('za', 'South Africa', 'Africa', ['Pretoria', 'Cape Town', 'Bloemfontein']),
  country('ro', 'Romania', 'Europe', ['Bucharest']),
  country('at', 'Austria', 'Europe', ['Vienna']),
  country('au', 'Australia', 'Oceania', ['Canberra']),
  country('fj', 'Fiji', 'Oceania', ['Suva']),
  country('ua', 'Ukraine', 'Europe', ['Kyiv'], { capitalAltNames: ['Kiev'] }),
  country('ee', 'Estonia', 'Europe', ['Tallinn'], { capitalAltNames: ['Reval'] }),
  country('ci', "Côte d'Ivoire", 'Africa', ['Yamoussoukro'], { altNames: ['Ivory Coast'] }),
]

const facets: Facet[] = [
  'flag-to-country',
  'country-to-flag',
  'country-to-capital',
  'capital-to-country',
]
const lookalikesOf = (iso2: string) => (iso2 === 'td' ? ['ro'] : iso2 === 'ro' ? ['td'] : [])

describe('makeCard', () => {
  it('builds a sound card for every facet, tier and country', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...countries),
        fc.constantFrom(...facets),
        fc.constantFrom<Tier>(0, 1, 2, 3),
        fc.integer(),
        (c, facet, tier, seed) => {
          const card: Card = makeCard(itemId(c.iso2, facet), tier, countries, seeded(seed), {
            lookalikesOf,
          })
          expect(card.country.iso2).toBe(c.iso2)
          expect(c.capitals).toContain(card.capital)

          if (card.kind === 'claim') {
            expect(tier).toBe(0)
            expect(card.isTrue).toBe(card.claimed.country.iso2 === c.iso2)
          }
          if (card.kind === 'choice') {
            expect(card.options).toHaveLength(card.tier === 1 ? 2 : 4)
            expect(card.options[card.correctIndex]?.country.iso2).toBe(c.iso2)
            const codes = card.options.map((o) => o.country.iso2)
            expect(new Set(codes).size).toBe(codes.length)
            const texts = card.options.map((o) => o.text)
            expect(new Set(texts).size).toBe(texts.length)
          }
          if (card.kind === 'typed') {
            expect(tier).toBe(3)
            expect(facet).not.toBe('country-to-flag')
            expect(card.rivals).not.toContain(c.name)
            // Every other country's answers, aliases included, count as rivals.
            for (const other of countries.filter((o) => o.iso2 !== c.iso2)) {
              const theirs =
                facet === 'country-to-capital'
                  ? [...other.capitals, ...other.capitalAltNames]
                  : [other.name, ...other.altNames]
              for (const answer of theirs) expect(card.rivals).toContain(answer)
            }
          }
        },
      ),
    )
  })

  it('never types a flag, so country-to-flag at T3 becomes four options', () => {
    const card = makeCard('td-country-to-flag', 3, countries, seeded(1))
    expect(card.kind).toBe('choice')
    expect(card.tier).toBe(2)
  })

  it('makes true claims about half the time', () => {
    const random = seeded(7)
    const cards = Array.from({ length: 1000 }, () =>
      makeCard('td-flag-to-country', 0, countries, random),
    )
    const share = cards.filter((c) => c.kind === 'claim' && c.isTrue).length / cards.length
    expect(share).toBeGreaterThan(0.45)
    expect(share).toBeLessThan(0.55)
  })

  it('always includes a lookalike in four-option flag questions', () => {
    for (let seed = 0; seed < 50; seed++) {
      const card = makeCard('td-flag-to-country', 2, countries, seeded(seed), { lookalikesOf })
      if (card.kind !== 'choice') throw new Error('expected a choice')
      expect(card.options.map((o) => o.country.iso2)).toContain('ro')
    }
  })

  it('shows capitals as options for country-to-capital', () => {
    const card = makeCard('td-country-to-capital', 1, countries, seeded(3))
    if (card.kind !== 'choice') throw new Error('expected a choice')
    expect(card.options[card.correctIndex]?.text).toBe("N'Djamena")
  })
})

describe('capitalGivesAway', () => {
  it('spots capitals that name their country, and only those', () => {
    const named = (name: string, capitals: string[], altNames: string[] = []) =>
      capitalGivesAway(country('xx', name, 'Asia', capitals, { altNames }))
    expect(named('Kuwait', ['Kuwait City'])).toBe(true)
    expect(named('Holy See', ['Vatican City'], ['Vatican City'])).toBe(true)
    expect(named('Tunisia', ['Tunis'])).toBe(true)
    expect(named('Brazil', ['Brasília'], ['Brasil'])).toBe(false)
    expect(named('France', ['Paris'])).toBe(false)
  })
})

describe('pickDistractors', () => {
  it('prefers the same region, then anywhere, and never the country itself', () => {
    const fiji = countries.find((c) => c.iso2 === 'fj') as CountryLike
    const picked = pickDistractors(fiji, countries, 3, seeded(4))
    expect(picked[0]?.iso2).toBe('au')
    expect(picked.map((c) => c.iso2)).not.toContain('fj')
    expect(picked).toHaveLength(3)
  })
})

describe('marking', () => {
  it('marks claims, treating "don\'t know" as wrong', () => {
    const card = makeCard('td-flag-to-country', 0, countries, () => 0)
    if (card.kind !== 'claim') throw new Error('expected a claim')
    expect(card.isTrue).toBe(true)
    expect(isClaimCorrect(card, 'true')).toBe(true)
    expect(isClaimCorrect(card, 'false')).toBe(false)
    expect(isClaimCorrect(card, 'unknown')).toBe(false)
  })

  it('marks choices by index, with null as "don\'t know"', () => {
    const card = makeCard('td-flag-to-country', 2, countries, seeded(5))
    if (card.kind !== 'choice') throw new Error('expected a choice')
    expect(isChoiceCorrect(card, card.correctIndex)).toBe(true)
    expect(isChoiceCorrect(card, (card.correctIndex + 1) % 4)).toBe(false)
    expect(isChoiceCorrect(card, null)).toBe(false)
  })

  it('accepts any capital and its alternative names when typed', () => {
    const za = makeCard('za-country-to-capital', 3, countries, seeded(6))
    if (za.kind !== 'typed') throw new Error('expected typed')
    expect(checkTypedCard(za, 'cape town').correct).toBe(true)
    expect(checkTypedCard(za, 'Pretoria').correct).toBe(true)
    expect(checkTypedCard(za, 'Dakar').correct).toBe(false)
    expect(rightAnswers(za)).toEqual(['Pretoria', 'Cape Town', 'Bloemfontein'])

    const ua = makeCard('ua-country-to-capital', 3, countries, seeded(6))
    if (ua.kind !== 'typed') throw new Error('expected typed')
    expect(checkTypedCard(ua, 'Kiev').correct).toBe(true)
  })

  it("rejects another country's old capital name", () => {
    const card = makeCard('ua-country-to-capital', 3, countries, seeded(8))
    if (card.kind !== 'typed') throw new Error('expected typed')
    expect(checkTypedCard(card, 'Reval').correct).toBe(false)
  })

  it('rejects a neighbouring country typed for a country', () => {
    const card = makeCard('at-flag-to-country', 3, countries, seeded(7))
    if (card.kind !== 'typed') throw new Error('expected typed')
    expect(checkTypedCard(card, 'Australia').correct).toBe(false)
    expect(checkTypedCard(card, 'Austira').correct).toBe(true)
  })
})
