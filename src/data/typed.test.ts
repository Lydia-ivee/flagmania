import { describe, expect, it } from 'vitest'
import { checkTypedCard, makeCard } from '../core/cards.ts'
import { normalise } from '../core/matching.ts'
import { seeded } from '../core/random.ts'
import { countries } from './countries.ts'

/** Marks one typed answer against the real data. */
const typed = (itemId: string, text: string) => {
  const card = makeCard(itemId, 3, countries, seeded(1))
  if (card.kind !== 'typed') throw new Error(`${itemId} is not a typed card`)
  return checkTypedCard(card, text).correct
}

// Cases found by review. Each one was wrongly accepted or rejected at some point.
const cases: [itemId: string, text: string, right: boolean][] = [
  ['bh-country-to-capital', 'Panama', false],
  ['bh-country-to-capital', 'Manama', true],
  ['cv-country-to-capital', 'Praha', false],
  ['vu-country-to-capital', 'Vilna', false],
  ['ua-country-to-capital', 'Kiev', true],
  ['ua-country-to-capital', 'Kitu', false],
  ['am-country-to-capital', 'Reval', false],
  ['ng-flag-to-country', 'Nigera', false],
  ['ne-flag-to-country', 'Nigera', false],
  ['ng-flag-to-country', 'Nigeria', true],
  ['ne-flag-to-country', 'Niger', true],
  ['at-flag-to-country', 'Austrlia', false],
  ['at-flag-to-country', 'Australia', false],
  ['at-flag-to-country', 'Austira', true],
  ['ml-flag-to-country', 'Malai', false],
  ['ir-flag-to-country', 'Irak', false],
  ['dm-flag-to-country', 'Dominican', false],
  ['cd-flag-to-country', 'Congo', false],
  ['cg-flag-to-country', 'Congo', false],
  ['cd-flag-to-country', 'DR Congo', true],
  ['kr-flag-to-country', 'Korea', false],
  ['kr-flag-to-country', 'South Korea', true],
  ['lk-flag-to-country', 'Lanka', false],
  ['lk-flag-to-country', 'Sri Lanka', true],
  ['za-country-to-capital', 'Cape', false],
  ['za-country-to-capital', 'Cape Town', true],
  ['in-country-to-capital', 'Delhi', true],
  ['au-flag-to-country', 'Styria', false],
  ['ci-flag-to-country', 'Ivory Coast', true],
  ['us-country-to-capital', 'Washington', true],
  ['gq-country-to-capital', 'Malabo', true],
  ['sd-flag-to-country', 'South Sudan', false],
  ['gn-flag-to-country', 'Guinea-Bissau', false],
]

describe('typed answers against the real data', () => {
  it.each(cases)('%s, "%s" is right: %s', (itemId, text, right) => {
    expect(typed(itemId, text)).toBe(right)
  })

  it('never shares an alias between two countries', () => {
    const owners = new Map<string, string>()
    for (const country of countries) {
      for (const alias of country.altNames) {
        const key = normalise(alias)
        expect(owners.get(key) ?? country.iso2, alias).toBe(country.iso2)
        owners.set(key, country.iso2)
      }
    }
  })

  it('keeps inverted or bracketed forms out of the aliases', () => {
    for (const country of countries) {
      for (const alias of [...country.altNames, ...country.capitalAltNames]) {
        expect(alias, country.iso2).not.toMatch(/[,()]/)
      }
    }
  })
})
