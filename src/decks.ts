import { capitalGivesAway } from './core/cards.ts'
import { catalogue, parseItemId } from './core/items.ts'
import type { Facet } from './core/types.ts'
import { countries } from './data/countries.ts'
import type { DeckId, Settings } from './storage/db.ts'

export const deckFacets: Record<DeckId, Facet[]> = {
  flags: ['flag-to-country', 'country-to-flag'],
  capitals: ['country-to-capital', 'capital-to-country'],
}

export const deckNames: Record<DeckId, string> = { flags: 'Flags', capitals: 'Capitals' }

export const deckIds = Object.keys(deckFacets) as DeckId[]

/** Countries whose capital names the country, such as Kuwait City. See capitalGivesAway. */
const giveaways = new Set(countries.filter(capitalGivesAway).map((c) => c.iso2))

/**
 * Every item in the decks that are switched on. Capital-to-country is skipped where the
 * capital gives the country away.
 */
export function catalogueFor(settings: Settings): string[] {
  const facets = deckIds.filter((id) => settings.decks[id]).flatMap((id) => deckFacets[id])
  return catalogue(
    countries.map((c) => c.iso2),
    facets,
  ).filter((id) => {
    const { iso2, facet } = parseItemId(id)
    return facet !== 'capital-to-country' || !giveaways.has(iso2)
  })
}
