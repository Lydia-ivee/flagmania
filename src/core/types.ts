export type Facet =
  'flag-to-country' | 'country-to-flag' | 'country-to-capital' | 'capital-to-country'

/** Question format. T0 true or false, T1 two options, T2 four options, T3 typed. */
export type Tier = 0 | 1 | 2 | 3

/** Leitner box. 1 is new or just missed, 5 is well known. */
export type Box = 1 | 2 | 3 | 4 | 5

/** What the app remembers about one item, such as "France, flag-to-country". */
export type ItemState = {
  id: string
  box: Box
  tier: Tier
  /** Epoch milliseconds. The item is due once now reaches this. */
  dueAt: number
  lastSeenAt: number
  correctCount: number
  wrongCount: number
}

export type Answer = {
  correct: boolean
  /** The tier the question was actually asked at. */
  tier: Tier
  /** Epoch milliseconds. */
  at: number
}

/** The parts of a country the core needs. */
export type CountryLike = {
  iso2: string
  name: string
  altNames: readonly string[]
  capitals: readonly string[]
  capitalAltNames: readonly string[]
  region: string
}

export type Random = () => number
