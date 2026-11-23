import type { Facet } from './types.ts'

/** Item ids look like "fr-flag-to-country". ISO codes are always two letters. */
export const itemId = (iso2: string, facet: Facet) => `${iso2}-${facet}`

export const parseItemId = (id: string) => ({
  iso2: id.slice(0, 2),
  facet: id.slice(3) as Facet,
})

export const catalogue = (isoCodes: readonly string[], facets: readonly Facet[]) =>
  isoCodes.flatMap((iso2) => facets.map((facet) => itemId(iso2, facet)))
