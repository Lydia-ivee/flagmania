import { useEffect, useState } from 'react'
import { catalogue as buildCatalogue } from './core/items.ts'
import { applyAnswer, newItemState } from './core/scheduler.ts'
import { buildSession, defaultSessionOptions } from './core/session.ts'
import type { Facet, ItemState, Random } from './core/types.ts'
import { countries } from './data/countries.ts'
import { loadStates, openDb, saveState, type FlagmaniaDb } from './storage/db.ts'
import { HomeScreen } from './ui/HomeScreen.tsx'
import { SessionScreen, type SessionSummary } from './ui/SessionScreen.tsx'
import { SummaryScreen } from './ui/SummaryScreen.tsx'

/** M1 teaches flag to country only. The other facets arrive with the harder formats in M2. */
const facetsInPlay: Facet[] = ['flag-to-country']
const catalogue = buildCatalogue(
  countries.map((c) => c.iso2),
  facetsInPlay,
)

const regionByIso = new Map(countries.map((c) => [c.iso2, c.region]))
const regionOf = (id: string) => regionByIso.get(id.slice(0, 2)) ?? ''

type Screen =
  | { kind: 'home' }
  | { kind: 'session'; queue: string[]; key: number }
  | { kind: 'summary'; summary: SessionSummary }

type Props = { db?: FlagmaniaDb; random?: Random }

export function App({ db: givenDb, random = Math.random }: Props) {
  const [db] = useState(() => givenDb ?? openDb())
  const [states, setStates] = useState<Map<string, ItemState> | null>(null)
  const [storageWarning, setStorageWarning] = useState(false)
  // Off when saved progress could not be read, so a fresh record never overwrites a real one.
  const [canSave, setCanSave] = useState(true)
  const [screen, setScreen] = useState<Screen>({ kind: 'home' })
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    loadStates(db)
      .then(setStates)
      .catch(() => {
        setStorageWarning(true)
        setCanSave(false)
        setStates(new Map())
      })
  }, [db])

  // A phone can keep the app open for days. Refresh what is due when it comes back.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [])

  if (!states) {
    return (
      <main className="app">
        <p className="loading">Loading your progress</p>
      </main>
    )
  }

  const start = () => {
    const at = Date.now()
    setNow(at)
    setScreen({
      kind: 'session',
      queue: buildSession(catalogue, states, at, defaultSessionOptions, random, regionOf),
      key: at,
    })
  }

  const goHome = () => {
    setNow(Date.now())
    setScreen({ kind: 'home' })
  }

  const recordAnswer = (itemId: string, correct: boolean) => {
    const at = Date.now()
    const facet = itemId.slice(3) as Facet
    const current = states.get(itemId) ?? newItemState(itemId, at)
    // Every card is true or false (T0) until the other formats arrive in M2.
    const next = applyAnswer(current, { correct, tier: 0, at }, facet)
    setStates(new Map(states).set(itemId, next))
    if (canSave) saveState(db, next).catch(() => setStorageWarning(true))
  }

  return (
    <main className="app">
      <header>
        <h1>Flagmania</h1>
      </header>
      {screen.kind === 'home' && (
        <HomeScreen
          catalogue={catalogue}
          states={states}
          now={now}
          onStart={start}
          storageWarning={storageWarning}
        />
      )}
      {screen.kind === 'session' && (
        <SessionScreen
          key={screen.key}
          queue={screen.queue}
          countries={countries}
          random={random}
          onAnswer={recordAnswer}
          onFinish={(summary) => setScreen({ kind: 'summary', summary })}
        />
      )}
      {screen.kind === 'summary' && <SummaryScreen summary={screen.summary} onDone={goHome} />}
    </main>
  )
}
