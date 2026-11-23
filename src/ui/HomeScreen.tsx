import type { Box, ItemState } from '../core/types.ts'

type Props = {
  catalogue: readonly string[]
  states: ReadonlyMap<string, ItemState>
  now: number
  onStart: () => void
  storageWarning: boolean
}

const boxes: Box[] = [1, 2, 3, 4, 5]

export function HomeScreen({ catalogue, states, now, onStart, storageWarning }: Props) {
  const known = catalogue.map((id) => states.get(id)).filter((s) => s !== undefined)
  const due = known.filter((s) => s.dueAt <= now).length
  const unseen = catalogue.length - known.length
  const perBox = boxes.map((box) => known.filter((s) => s.box === box).length)
  const most = Math.max(1, ...perBox)

  return (
    <section className="home">
      <p className="lede">Learn every flag in the world, a few cards at a time.</p>

      <dl className="stats">
        <div>
          <dt>Flags seen</dt>
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
        <figure className="boxes" aria-label="Flags in each box">
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
