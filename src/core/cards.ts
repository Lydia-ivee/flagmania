import { pickOne } from './random.ts'
import { parseItemId } from './items.ts'
import type { CountryLike, Facet, Random } from './types.ts'

/** A T0 card. Shows a prompt and a claim the learner marks true or false. */
export type ClaimCard<C extends CountryLike = CountryLike> = {
  kind: 'claim'
  itemId: string
  facet: Facet
  /** The country the item is about. */
  country: C
  /** The country named in the claim. The same as country when the claim is true. */
  claimed: C
  isTrue: boolean
}

export function makeClaimCard<C extends CountryLike>(
  itemId: string,
  countries: readonly C[],
  random: Random,
): ClaimCard<C> {
  const { iso2, facet } = parseItemId(itemId)
  const country = countries.find((c) => c.iso2 === iso2)
  if (!country) throw new Error(`Unknown country in item ${itemId}`)

  const isTrue = random() < 0.5
  if (isTrue) return { kind: 'claim', itemId, facet, country, claimed: country, isTrue }

  const others = countries.filter((c) => c.iso2 !== iso2)
  const neighbours = others.filter((c) => c.region === country.region)
  const claimed = pickOne(neighbours.length > 0 ? neighbours : others, random)
  return { kind: 'claim', itemId, facet, country, claimed, isTrue }
}

export type ClaimResponse = 'true' | 'false' | 'unknown'

export const isCorrect = (card: ClaimCard, response: ClaimResponse) =>
  response !== 'unknown' && (response === 'true') === card.isTrue
