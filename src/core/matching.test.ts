import { describe, expect, it } from 'vitest'
import { checkTyped, editDistance, normalise } from './matching.ts'

const ok = { correct: true, exact: true }
const typo = { correct: true, exact: false }
const wrong = { correct: false, exact: false }

describe('normalise', () => {
  it('drops case, accents, punctuation, spaces and a leading "the"', () => {
    expect(normalise("Côte d'Ivoire")).toBe('cotedivoire')
    expect(normalise('  The Gambia ')).toBe('gambia')
    expect(normalise('Timor-Leste')).toBe('timorleste')
    expect(normalise('Washington, D.C.')).toBe('washingtondc')
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
    expect(checkTyped('cote divoire', ["Côte d'Ivoire", 'Ivory Coast'], rivals)).toEqual(ok)
    expect(checkTyped('Ivory Coast', ["Côte d'Ivoire", 'Ivory Coast'], rivals)).toEqual(ok)
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

  it('allows no typos in very short answers', () => {
    expect(checkTyped('Pero', ['Peru'], [])).toEqual(typo)
    expect(checkTyped('Lme', ['Lima'], [])).toEqual(wrong)
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

  it('rejects blank input', () => {
    expect(checkTyped('   ', ['France'], rivals)).toEqual(wrong)
  })
})
