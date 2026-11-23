import { useEffect, useState } from 'react'
import { parseItemId } from './core/items.ts'
import { applyAnswer, askTier, newItemState } from './core/scheduler.ts'
import { buildSession, defaultSessionOptions } from './core/session.ts'
import type { ItemState, Random, Tier } from './core/types.ts'
import { countries } from './data/countries.ts'
import { catalogueFor } from './decks.ts'
import {
  loadSettings,
  loadStates,
  openDb,
  saveSettings,
  saveState,
  type DeckId,
  type FlagmaniaDb,
  type Settings,
  defaultSettings,
} from './storage/db.ts'
import { HomeScreen } from './ui/HomeScreen.tsx'
import { SessionScreen, type SessionSummary } from './ui/SessionScreen.tsx'
import { SummaryScreen } from './ui/SummaryScreen.tsx'

const regionByIso = new Map(countries.map((c) => [c.iso2, c.region]))
const regionOf = (id: string) => regionByIso.get(id.slice(0, 2)) ?? ''

type Screen =
  | { kind: 'home' }
  | { kind: 'session'; queue: string[]; key: number }
  | { kind: 'summary'; summary: SessionSummary }

type Loaded = { states: Map<string, ItemState>; settings: Settings }

type Props = { db?: FlagmaniaDb; random?: Random }

export function App({ db: givenDb, random = Math.random }: Props) {
  const [db] = useState(() => givenDb ?? openDb())
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [storageWarning, setStorageWarning] = useState(false)
  // Off when saved progress could not be read, so a fresh record never overwrites a real one.
  const [canSave, setCanSave] = useState(true)
  const [screen, setScreen] = useState<Screen>({ kind: 'home' })
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    Promise.all([loadStates(db), loadSettings(db)])
      .then(([states, settings]) => setLoaded({ states, settings }))
      .catch(async () => {
        setStorageWarning(true)
        setCanSave(false)
        setLoaded({
          states: new Map(),
          settings: await loadSettings(db).catch(() => defaultSettings),
        })
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

  if (!loaded) {
    return (
      <main className="app">
        <p className="loading">Loading your progress</p>
      </main>
    )
  }

  const { states, settings } = loaded
  const catalogue = catalogueFor(settings)

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

  const tierFor = (itemId: string): Tier => askTier(states.get(itemId), parseItemId(itemId).facet)

  const recordAnswer = (itemId: string, correct: boolean, tier: Tier) => {
    const at = Date.now()
    const { facet } = parseItemId(itemId)
    const current = states.get(itemId) ?? newItemState(itemId, at)
    const next = applyAnswer(current, { correct, tier, at }, facet)
    setLoaded({ settings, states: new Map(states).set(itemId, next) })
    if (canSave) saveState(db, next).catch(() => setStorageWarning(true))
  }

  const toggleDeck = (deck: DeckId) => {
    const decks = { ...settings.decks, [deck]: !settings.decks[deck] }
    // Keep at least one deck on, or there is nothing to study.
    if (!Object.values(decks).some(Boolean)) return
    const nextSettings = { ...settings, decks }
    setLoaded({ states, settings: nextSettings })
    if (canSave) saveSettings(db, nextSettings).catch(() => setStorageWarning(true))
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
          settings={settings}
          onToggleDeck={toggleDeck}
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
          tierFor={tierFor}
          onAnswer={recordAnswer}
          onFinish={(summary) => setScreen({ kind: 'summary', summary })}
        />
      )}
      {screen.kind === 'summary' && <SummaryScreen summary={screen.summary} onDone={goHome} />}
    </main>
  )
}
