import { useState } from 'react'
import { countries, flagUrl } from './data/countries.ts'

const pickIndex = (exclude: number) => {
  let next = exclude
  while (next === exclude) next = Math.floor(Math.random() * countries.length)
  return next
}

// Placeholder for milestone M0. It proves the data and flags load once deployed.
export function App() {
  const [index, setIndex] = useState(() => pickIndex(-1))
  const country = countries[index]
  if (!country) return null

  return (
    <main className="app">
      <h1>Flagmania</h1>
      <p className="status">In early development. Swiping arrives in the next milestone.</p>
      <figure className="card">
        <img src={flagUrl(country)} alt={`Flag of ${country.name}`} width={320} height={240} />
        <figcaption>
          <strong>{country.name}</strong>
          <span>{country.capitals.join(' or ')}</span>
        </figcaption>
      </figure>
      <button type="button" onClick={() => setIndex(pickIndex(index))}>
        Another flag
      </button>
      <p className="meta">{countries.length} countries loaded</p>
    </main>
  )
}
