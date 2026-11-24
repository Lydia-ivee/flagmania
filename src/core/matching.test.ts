import { describe, expect, it } from 'vitest'
import { checkTyped, editDistance, normalise } from './matching.ts'

const ok = { correct: true, exact: true, ambiguous: false }
const typo = { correct: true, exact: false, ambiguous: false }
const wrong = { correct: false, exact: false, ambiguous: false }
const unclear = { correct: false, exact: false, ambiguous: true }

describe('normalise', () => {
  it('drops case, accents, punctuation, spaces and a leading "the"', () => {
    expect(normalise("Côte d'Ivoire")).toBe('cotedivoire')
    expect(normalise('  The Gambia ')).toBe('gambia')
    expect(normalise('Timor-Leste')).toBe('timorleste')
    expect(normalise('Washington, D.C.')).toBe('washingtondc')
  })

  it('reads "&" as "and" and a whole-word "St" as "Saint"', () => {
    expect(normalise('Trinidad & Tobago')).toBe(normalise('Trinidad and Tobago'))
    expect(normalise('St Kitts & Nevis')).toBe(normalise('Saint Kitts and Nevis'))
    expect(normalise("St. John's")).toBe('saintjohns')
    expect(normalise('Estonia')).toBe('estonia')
    expect(normalise('Bucharest')).toBe('bucharest')
  })
})

describe('editDistance', () => {
  it('counts a swap of neighbouring letters as one edit', () => {
    expect(editDistance('austria', 'austira')).toBe(1)
    expect(editDistance('kitten', 'sitting')).toBe(3)
    expect(editDistance('', 'abc')).toBe(3)
  })
})

describe('checkTyped', () => {
  const rivals = ['Australia', 'Iraq', 'Niger', 'Nigeria', 'Slovakia', 'Mali', 'Malawi']

  it('accepts exact answers in any case, with or without accents', () => {
    expect(checkTyped('france', ['France'], rivals)).toEqual(ok)
    expect(checkTyped('cote divoire', ["Côte d'Ivoire"], rivals, ['Ivory Coast'])).toEqual(ok)
    expect(checkTyped('Ivory Coast', ["Côte d'Ivoire"], rivals, ['Ivory Coast'])).toEqual(ok)
  })

  it('accepts the part before a comma or bracket', () => {
    expect(checkTyped('Washington', ['Washington, D.C.'], [])).toEqual(ok)
    expect(checkTyped('bolivia', ['Bolivia (Plurinational State of)'], [])).toEqual(ok)
  })

  it('allows one typo up to 6 letters and two above', () => {
    expect(checkTyped('Frnace', ['France'], rivals)).toEqual(typo)
    expect(checkTyped('Fronca', ['France'], rivals)).toEqual(wrong)
    expect(checkTyped('Argentnia', ['Argentina'], rivals)).toEqual(typo)
    expect(checkTyped('Agrentnia', ['Argentina'], rivals)).toEqual(typo)
  })

  it('allows one typo in a four-letter answer and none in three letters', () => {
    expect(checkTyped('Pero', ['Peru'], [])).toEqual(typo)
    expect(checkTyped('Abd', ['Abc'], [])).toEqual(wrong)
  })

  it('needs aliases to be typed exactly', () => {
    expect(checkTyped('Ivory Coast', ["Côte d'Ivoire"], [], ['Ivory Coast'])).toEqual(ok)
    expect(checkTyped('Ivory Cost', ["Côte d'Ivoire"], [], ['Ivory Coast'])).toEqual(wrong)
  })

  it('rejects another country even when it is within the typo allowance', () => {
    expect(checkTyped('Australia', ['Austria'], rivals)).toEqual(wrong)
    expect(checkTyped('Iraq', ['Iran'], rivals)).toEqual(wrong)
    expect(checkTyped('Slovakia', ['Slovenia'], rivals)).toEqual(wrong)
    expect(checkTyped('Nigeria', ['Niger'], rivals)).toEqual(wrong)
  })

  it('rejects a typo that sits closer to another answer', () => {
    expect(checkTyped('Malawe', ['Mali'], rivals)).toEqual(wrong)
  })

  it('rejects a typo that is as close to another answer, and says it is unclear', () => {
    expect(checkTyped('Nigera', ['Niger'], rivals)).toEqual(unclear)
    expect(checkTyped('Nigera', ['Nigeria'], ['Niger'])).toEqual(unclear)
  })

  it('rejects a name that belongs to this answer and another one too', () => {
    expect(checkTyped('Congo', ['Republic of the Congo'], ['Congo'], ['Congo'])).toEqual(unclear)
  })

  it('rejects blank input', () => {
    expect(checkTyped('   ', ['France'], rivals)).toEqual(wrong)
  })
})
