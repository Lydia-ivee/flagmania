import type { Box, ItemState } from '../core/types.ts'
import { deckIds, deckNames } from '../decks.ts'
import type { DeckId, Settings } from '../storage/db.ts'

type Props = {
  catalogue: readonly string[]
  states: ReadonlyMap<string, ItemState>
  now: number
  settings: Settings
  onToggleDeck: (deck: DeckId) => void
  onStart: () => void
  storageWarning: boolean
}

const boxes: Box[] = [1, 2, 3, 4, 5]

export function HomeScreen(props: Props) {
  const { catalogue, states, now, settings, onToggleDeck, onStart, storageWarning } = props
  const known = catalogue.map((id) => states.get(id)).filter((s) => s !== undefined)
  const due = known.filter((s) => s.dueAt <= now).length
  const unseen = catalogue.length - known.length
  const perBox = boxes.map((box) => known.filter((s) => s.box === box).length)
  const most = Math.max(1, ...perBox)
  const onlyOneOn = deckIds.filter((id) => settings.decks[id]).length === 1

  return (
    <section className="home">
      <p className="lede">Learn every flag and capital in the world, a few cards at a time.</p>

      <fieldset className="decks">
        <legend>Decks</legend>
        {deckIds.map((id) => {
          const on = settings.decks[id]
          return (
            <button
              key={id}
              type="button"
              className={`deck-toggle${on ? ' on' : ''}`}
              aria-pressed={on}
              disabled={on && onlyOneOn}
              onClick={() => onToggleDeck(id)}
            >
              {deckNames[id]}
            </button>
          )
        })}
      </fieldset>

      <dl className="stats">
        <div>
          <dt>Cards seen</dt>
          <dd>
            {known.length} of {catalogue.length}
          </dd>
        </div>
        <div>
          <dt>Due now</dt>
          <dd>{due}</dd>
        </div>
      </dl>

      {known.length > 0 && (
        <figure className="boxes" aria-label="Cards in each box">
          {perBox.map((count, i) => (
            <div key={boxes[i]} className="box">
              <span className="bar" style={{ height: `${(count / most) * 100}%` }} />
              <span className="count">{count}</span>
              <span className="label">Box {boxes[i]}</span>
            </div>
          ))}
          <figcaption>Box 1 is new or just missed. Box 5 is well known.</figcaption>
        </figure>
      )}

      {due > 0 || unseen > 0 ? (
        <button type="button" className="start" onClick={onStart}>
          Start session
        </button>
      ) : (
        <p className="caught-up">All caught up. Come back tomorrow.</p>
      )}

      {storageWarning && (
        <p className="warning" role="alert">
          This browser is not letting Flagmania save, so progress will be lost when you close the
          page.
        </p>
      )}
    </section>
  )
}
