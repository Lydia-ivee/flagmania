import { parseItemId } from '../core/items.ts'
import type { Facet } from '../core/types.ts'
import { flagUrl } from '../data/countries.ts'
import type { SessionSummary } from './SessionScreen.tsx'

type Props = { summary: SessionSummary; onDone: () => void }

const facetLabels: Record<Facet, string> = {
  'flag-to-country': 'Flag to country',
  'country-to-flag': 'Country to flag',
  'country-to-capital': 'Its capital',
  'capital-to-country': 'Capital to country',
}

export function SummaryScreen({ summary, onDone }: Props) {
  return (
    <section className="summary">
      <h2>Session done</h2>
      <p className="score">
        {summary.rightFirstTime} of {summary.items} right first time
      </p>
      {summary.missed.length > 0 ? (
        <>
          <p>Missed first time. These come back soon.</p>
          <ul className="missed">
            {summary.missed.map(({ itemId, country }) => (
              <li key={itemId}>
                <img src={flagUrl(country)} alt="" width={48} height={36} />
                <span>
                  {country.name}
                  <small>{facetLabels[parseItemId(itemId).facet]}</small>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>No misses. These come back in a day or more.</p>
      )}
      <button type="button" onClick={onDone} autoFocus>
        Back to start
      </button>
    </section>
  )
}
