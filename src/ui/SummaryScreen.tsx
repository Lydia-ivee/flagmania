import { flagUrl } from '../data/countries.ts'
import type { SessionSummary } from './SessionScreen.tsx'

type Props = { summary: SessionSummary; onDone: () => void }

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
            {summary.missed.map((country) => (
              <li key={country.iso2}>
                <img src={flagUrl(country)} alt="" width={48} height={36} />
                {country.name}
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
