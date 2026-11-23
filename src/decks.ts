import { catalogue } from './core/items.ts'
import type { Facet } from './core/types.ts'
import { countries } from './data/countries.ts'
import type { DeckId, Settings } from './storage/db.ts'

export const deckFacets: Record<DeckId, Facet[]> = {
  flags: ['flag-to-country', 'country-to-flag'],
  capitals: ['country-to-capital', 'capital-to-country'],
}

export const deckNames: Record<DeckId, string> = { flags: 'Flags', capitals: 'Capitals' }

export const deckIds = Object.keys(deckFacets) as DeckId[]

/** Every item in the decks that are switched on. */
export function catalogueFor(settings: Settings): string[] {
  const facets = deckIds.filter((id) => settings.decks[id]).flatMap((id) => deckFacets[id])
  return catalogue(
    countries.map((c) => c.iso2),
    facets,
  )
}
