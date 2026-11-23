import { useId, useState, type ReactNode } from 'react'
import { rightAnswers, type Card, type ChoiceCard, type Option } from '../core/cards.ts'
import { flagUrl, type Country } from '../data/countries.ts'
import type { SwipeDirection } from './useSwipe.ts'

/** Where each option sits, in the order the options are listed on the card. */
export const optionDirections = (count: number): SwipeDirection[] =>
  count === 2 ? ['left', 'right'] : ['up', 'left', 'right', 'down']

const arrows: Record<SwipeDirection, string> = { up: '↑', left: '←', right: '→', down: '↓' }

const Flag = ({ country, alt, small }: { country: Country; alt: string; small?: boolean }) => (
  <img
    className={small ? 'flag small' : 'flag'}
    src={flagUrl(country)}
    alt={alt}
    draggable={false}
    width={small ? 120 : 320}
    height={small ? 90 : 240}
  />
)

/** The top of the card. What is being asked about, plus the instruction or claim. */
type PromptProps = { card: Card<Country>; titleId: string; claimId: string }

export function Prompt({ card, titleId, claimId }: PromptProps) {
  const { facet, country } = card
  let picture: ReactNode = null
  let title: ReactNode = null
  let line: ReactNode

  if (facet === 'flag-to-country') {
    picture = <Flag country={country} alt="The flag to identify" />
    line =
      card.kind === 'claim' ? (
        <>
          This is the flag of <strong>{card.claimed.text}</strong>
        </>
      ) : card.kind === 'choice' ? (
        'Pick the country'
      ) : (
        'Type the country'
      )
  } else if (facet === 'country-to-flag') {
    if (card.kind === 'claim') {
      picture = <Flag country={card.claimed.country} alt="The flag in the claim" />
      line = (
        <>
          This is the flag of <strong>{country.name}</strong>
        </>
      )
    } else {
      title = country.name
      line = 'Pick its flag'
    }
  } else if (facet === 'country-to-capital') {
    title = country.name
    line =
      card.kind === 'claim' ? (
        <>
          Its capital is <strong>{card.claimed.text}</strong>
        </>
      ) : card.kind === 'choice' ? (
        'Pick its capital'
      ) : (
        'Type its capital'
      )
  } else {
    title = card.capital
    line =
      card.kind === 'claim' ? (
        <>
          This is the capital of <strong>{card.claimed.text}</strong>
        </>
      ) : card.kind === 'choice' ? (
        'Pick the country it is the capital of'
      ) : (
        'Type the country it is the capital of'
      )
  }

  return (
    <>
      {picture}
      {title && (
        <p className="prompt-title" id={titleId}>
          {title}
        </p>
      )}
      <p className="claim" id={claimId}>
        {line}
      </p>
    </>
  )
}

type PadProps = {
  card: ChoiceCard<Country>
  leaning: SwipeDirection | null
  onPick: (direction: SwipeDirection) => void
}

/** Option buttons laid out at the edge each one maps to. */
export function ChoicePad({ card, leaning, onPick }: PadProps) {
  const directions = optionDirections(card.options.length)
  const showFlags = card.facet === 'country-to-flag'
  return (
    <div className={`choice-pad count-${card.options.length}`}>
      {card.options.map((option, index) => {
        const direction = directions[index] as SwipeDirection
        return (
          <button
            key={option.country.iso2}
            type="button"
            className={`option ${direction}${leaning === direction ? ' on' : ''}`}
            onClick={() => onPick(direction)}
            aria-label={showFlags ? `Flag option ${index + 1}, ${direction}` : undefined}
          >
            <span className="arrow" aria-hidden="true">
              {arrows[direction]}
            </span>
            {showFlags ? <Flag country={option.country} alt="" small /> : option.text}
          </button>
        )
      })}
    </div>
  )
}

type TypedProps = { label: string; onSubmit: (text: string) => void; onSkip: () => void }

export function TypedAnswer({ label, onSubmit, onSkip }: TypedProps) {
  const [text, setText] = useState('')
  const inputId = useId()
  return (
    <form
      className="typed"
      onSubmit={(event) => {
        event.preventDefault()
        if (text.trim()) onSubmit(text)
      }}
    >
      <label htmlFor={inputId} className="visually-hidden">
        {label}
      </label>
      <input
        id={inputId}
        value={text}
        onChange={(event) => setText(event.target.value)}
        autoFocus
        autoComplete="off"
        autoCapitalize="words"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        placeholder="Your answer"
      />
      <div className="typed-buttons">
        <button type="button" className="unknown" onClick={onSkip}>
          Don&rsquo;t know
        </button>
        <button type="submit" disabled={!text.trim()}>
          Check
        </button>
      </div>
    </form>
  )
}

/** What the learner gave, for the feedback screen. */
export type Given =
  | { kind: 'claim'; value: 'true' | 'false' | 'unknown' }
  | { kind: 'choice'; index: number | null }
  | { kind: 'typed'; text: string | null }

/** The full right answer as a sentence. */
export function answerSentence(card: Card<Country>): ReactNode {
  const name = <strong>{card.country.name}</strong>
  switch (card.facet) {
    case 'country-to-capital':
      return (
        <>
          The capital of {name} is <strong>{rightAnswers(card).join(' or ')}</strong>.
        </>
      )
    case 'capital-to-country':
      return (
        <>
          {card.capital} is the capital of {name}.
        </>
      )
    default:
      return <>This is the flag of {name}.</>
  }
}

/** The option the learner was shown or picked that was not the answer, if any. */
function otherOption(card: Card<Country>, given: Given): Option<Country> | null {
  if (card.kind === 'claim') return card.isTrue ? null : card.claimed
  if (card.kind === 'choice' && given.kind === 'choice' && given.index !== null) {
    return given.index === card.correctIndex ? null : (card.options[given.index] ?? null)
  }
  return null
}

function Comparison({ card, option }: { card: Card<Country>; option: Option<Country> }) {
  if (card.facet === 'flag-to-country' || card.facet === 'country-to-flag') {
    return (
      <figure className="compare">
        <Flag country={option.country} alt={`Flag of ${option.country.name}`} small />
        <figcaption>{option.country.name}&rsquo;s flag, for comparison</figcaption>
      </figure>
    )
  }
  return (
    <p className="compare-text">
      {option.country.capitals.join(' or ')} is the capital of {option.country.name}.
    </p>
  )
}

type FeedbackProps = {
  card: Card<Country>
  given: Given
  correct: boolean
  exact: boolean
  ambiguous: boolean
  onNext: () => void
}

export function Feedback({ card, given, correct, exact, ambiguous, onNext }: FeedbackProps) {
  const other = otherOption(card, given)
  return (
    <div
      className={`feedback ${correct ? 'right' : 'wrong'}`}
      onClick={(event) => {
        // A tap anywhere on the panel moves on. The Next button handles its own clicks.
        if (!(event.target instanceof HTMLButtonElement)) onNext()
      }}
    >
      <h2>{correct ? 'Right' : 'Not this time'}</h2>
      <Flag country={card.country} alt={`Flag of ${card.country.name}`} />
      <p>{answerSentence(card)}</p>
      {given.kind === 'typed' && given.text && correct && !exact && (
        <p className="note">Accepted. The usual spelling is {rightAnswers(card).join(' or ')}.</p>
      )}
      {given.kind === 'typed' && given.text && !correct && ambiguous && (
        <p className="note">&ldquo;{given.text}&rdquo; could mean more than one answer.</p>
      )}
      {given.kind === 'typed' && given.text && !correct && !ambiguous && (
        <p className="note">You typed &ldquo;{given.text}&rdquo;.</p>
      )}
      {other && <Comparison card={card} option={other} />}
      <button type="button" onClick={onNext} autoFocus>
        Next
      </button>
    </div>
  )
}

export function announcement(card: Card<Country>, correct: boolean): string {
  const answer =
    card.facet === 'country-to-capital'
      ? `The capital of ${card.country.name} is ${rightAnswers(card).join(' or ')}.`
      : card.facet === 'capital-to-country'
        ? `${card.capital} is the capital of ${card.country.name}.`
        : `This is the flag of ${card.country.name}.`
  return `${correct ? 'Right' : 'Not this time'}. ${answer}`
}
