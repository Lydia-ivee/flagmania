import { parseItemId } from './items.ts'
import { checkTyped } from './matching.ts'
import { pickOne, shuffle } from './random.ts'
import type { CountryLike, Facet, Random, Tier } from './types.ts'

/** One answer on a card. `text` is a country name or a capital, by facet. */
export type Option<C extends CountryLike = CountryLike> = { country: C; text: string }

type Base<C extends CountryLike> = {
  itemId: string
  facet: Facet
  tier: Tier
  /** The country the item is about. */
  country: C
  /** The capital in play, for capital facets. The prompt for capital-to-country. */
  capital: string
}

/** T0. A claim the learner marks true or false. */
export type ClaimCard<C extends CountryLike = CountryLike> = Base<C> & {
  kind: 'claim'
  claimed: Option<C>
  isTrue: boolean
}

/** T1 and T2. Two or four options, one of them right. */
export type ChoiceCard<C extends CountryLike = CountryLike> = Base<C> & {
  kind: 'choice'
  options: Option<C>[]
  correctIndex: number
}

/** T3. The learner types the answer. */
export type TypedCard<C extends CountryLike = CountryLike> = Base<C> & {
  kind: 'typed'
  accepted: string[]
  rivals: string[]
}

export type Card<C extends CountryLike = CountryLike> = ClaimCard<C> | ChoiceCard<C> | TypedCard<C>

/** Whether the answer is a capital rather than a country. */
const answersWithCapital = (facet: Facet) => facet === 'country-to-capital'
const isFlagFacet = (facet: Facet) => facet === 'flag-to-country' || facet === 'country-to-flag'

const optionFor = <C extends CountryLike>(country: C, facet: Facet, random: Random): Option<C> => ({
  country,
  text: answersWithCapital(facet) ? pickOne(country.capitals, random) : country.name,
})

/**
 * Picks distractors. Flag questions take one lookalike first when there is one. The rest
 * come from the same region, then from anywhere.
 */
export function pickDistractors<C extends CountryLike>(
  country: C,
  countries: readonly C[],
  count: number,
  random: Random,
  lookalikes: readonly string[] = [],
): C[] {
  const others = countries.filter((c) => c.iso2 !== country.iso2)
  const picked: C[] = []
  const similar = others.filter((c) => lookalikes.includes(c.iso2))
  if (similar.length > 0 && count > 0) picked.push(pickOne(similar, random))

  const sameRegion = shuffle(
    others.filter((c) => c.region === country.region && !picked.includes(c)),
    random,
  )
  const elsewhere = shuffle(
    others.filter((c) => c.region !== country.region && !picked.includes(c)),
    random,
  )
  for (const candidate of [...sameRegion, ...elsewhere]) {
    if (picked.length >= count) break
    picked.push(candidate)
  }
  return picked
}

export type CardOptions = {
  lookalikesOf?: (iso2: string) => readonly string[]
}

export function makeCard<C extends CountryLike>(
  itemId: string,
  tier: Tier,
  countries: readonly C[],
  random: Random,
  options: CardOptions = {},
): Card<C> {
  const { iso2, facet } = parseItemId(itemId)
  const country = countries.find((c) => c.iso2 === iso2)
  if (!country) throw new Error(`Unknown country in item ${itemId}`)

  const capital = pickOne(country.capitals, random)
  const base = { itemId, facet, tier, country, capital }
  const right: Option<C> = { country, text: answersWithCapital(facet) ? capital : country.name }

  // Lookalikes only make sense when the flag is what tells the countries apart.
  const lookalikes = isFlagFacet(facet) && tier >= 2 ? (options.lookalikesOf?.(iso2) ?? []) : []

  if (tier === 0) {
    const isTrue = random() < 0.5
    if (isTrue) return { ...base, kind: 'claim', claimed: right, isTrue }
    const [other] = pickDistractors(country, countries, 1, random)
    if (!other) throw new Error('Need at least two countries')
    return { ...base, kind: 'claim', claimed: optionFor(other, facet, random), isTrue }
  }

  if (tier === 1 || tier === 2 || facet === 'country-to-flag') {
    const count = tier === 1 ? 1 : 3
    const wrong = pickDistractors(country, countries, count, random, lookalikes).map((c) =>
      optionFor(c, facet, random),
    )
    const all = shuffle([right, ...wrong], random)
    return {
      ...base,
      tier: tier === 1 ? 1 : 2,
      kind: 'choice',
      options: all,
      correctIndex: all.indexOf(right),
    }
  }

  const others = countries.filter((c) => c.iso2 !== iso2)
  const accepted = answersWithCapital(facet)
    ? [...country.capitals, ...country.capitalAltNames]
    : [country.name, ...country.altNames]
  const rivals = answersWithCapital(facet)
    ? others.flatMap((c) => c.capitals)
    : others.flatMap((c) => [c.name, ...c.altNames])
  return { ...base, kind: 'typed', accepted, rivals }
}

export type ClaimResponse = 'true' | 'false' | 'unknown'

export const isClaimCorrect = (card: ClaimCard, response: ClaimResponse) =>
  response !== 'unknown' && (response === 'true') === card.isTrue

/** `null` means "don't know". */
export const isChoiceCorrect = (card: ChoiceCard, index: number | null) =>
  index === card.correctIndex

export const checkTypedCard = (card: TypedCard, text: string) =>
  checkTyped(text, card.accepted, card.rivals)

/** Every right answer, for the feedback screen. Several capitals are all shown. */
export const rightAnswers = (card: Card): string[] =>
  answersWithCapital(card.facet) ? [...card.country.capitals] : [card.country.name]
