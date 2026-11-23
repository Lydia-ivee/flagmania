// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App.tsx'
import { countries } from './data/countries.ts'
import { seeded } from './core/random.ts'
import { newItemState } from './core/scheduler.ts'
import type { ItemState } from './core/types.ts'
import { openDb, type FlagmaniaDb } from './storage/db.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

let dbCount = 0
const freshDb = () => openDb(`flagmania-app-test-${dbCount++}`)

/** Answers every card with "True" until the summary appears. Returns how many cards it saw. */
async function playSession() {
  fireEvent.click(await screen.findByRole('button', { name: 'Start session' }))
  for (let cards = 1; cards < 60; cards++) {
    fireEvent.click(await screen.findByRole('button', { name: 'True' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    if (screen.queryByRole('heading', { name: 'Session done' })) return cards
  }
  throw new Error('The session never finished')
}

/** Reads the true or false card on screen and returns the button that answers it correctly. */
const rightAnswerButton = () => {
  const title = document.querySelector('.swipe-card .prompt-title')?.textContent ?? ''
  const claimed = document.querySelector('.claim strong')?.textContent ?? ''
  const byName = (name: string) => countries.find((c) => c.name === name)
  let isTrue: boolean
  if (!title) {
    // Flag cards. The flag shown and the country named match when the claim is true.
    const src = document.querySelector('.swipe-card img')?.getAttribute('src') ?? ''
    const shown = countries.find((c) => src.endsWith(`/${c.iso2}.svg`))
    isTrue = shown?.name === claimed
  } else if (byName(title)) {
    isTrue = byName(title)?.capitals.includes(claimed) ?? false
  } else {
    isTrue = byName(claimed)?.capitals.includes(title) ?? false
  }
  return screen.getByRole('button', { name: isTrue ? 'True' : 'False' })
}

/** New items always start as true or false cards. */
const startAndWaitForCard = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Start session' }))
  await screen.findByRole('button', { name: 'True' })
}

describe('a first session', () => {
  it('plays through, then keeps progress after a reload', async () => {
    const db = freshDb()
    render(<App db={db} random={seeded(42)} />)
    expect(await screen.findByText('0 of 780')).toBeTruthy()

    const cards = await playSession()
    expect(screen.getByText(/right first time/).textContent).toMatch(/^\d+ of 8 right first time$/)

    // Every card answered is stored exactly once, so nothing is skipped or counted twice.
    const saved = await db.items.toArray()
    expect(saved).toHaveLength(8)
    const answersStored = saved.reduce((sum, item) => sum + item.correctCount + item.wrongCount, 0)
    expect(answersStored).toBe(cards)
    expect(saved.every((item) => item.box <= 2 && item.tier <= 1)).toBe(true)

    // Close the page and open it again with the same database.
    cleanup()
    render(<App db={db} random={seeded(43)} />)
    expect(await screen.findByText('8 of 780')).toBeTruthy()
    const boxes = screen.getByRole('figure', { name: 'Cards in each box' })
    expect(within(boxes).getByText('Box 2')).toBeTruthy()
  })
})

describe('keyboard', () => {
  it('answers with keys and moves on with Enter', async () => {
    render(<App db={freshDb()} random={seeded(7)} />)
    await startAndWaitForCard()

    fireEvent.keyDown(window, { key: 'd' })
    expect(await screen.findByRole('heading', { name: 'Not this time' })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Enter' })
    expect(await screen.findByRole('button', { name: 'True' })).toBeTruthy()
  })

  it('ignores a held key and browser shortcuts', async () => {
    const db = freshDb()
    render(<App db={db} random={seeded(8)} />)
    await startAndWaitForCard()

    fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true })
    fireEvent.keyDown(window, { key: 'd', metaKey: true })
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true })
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)))

    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
    expect(await db.items.count()).toBe(0)
  })

  it('waits for the learner after a key or button answer, even a right one', async () => {
    render(<App db={freshDb()} random={seeded(9)} />)
    await startAndWaitForCard()

    fireEvent.click(rightAnswerButton())
    expect(await screen.findByRole('heading', { name: 'Right' })).toBeTruthy()
    await act(() => new Promise((resolve) => setTimeout(resolve, 1200)))
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy()
  })

  it('counts one answer when a button and a key land at the same moment', async () => {
    const db = freshDb()
    render(<App db={db} random={seeded(12)} />)
    await startAndWaitForCard()

    fireEvent.click(screen.getByRole('button', { name: 'True' }))
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await screen.findByRole('button', { name: 'Next' })
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)))
    expect(await db.items.count()).toBe(1)
    const [item] = await db.items.toArray()
    expect((item?.correctCount ?? 0) + (item?.wrongCount ?? 0)).toBe(1)
  })

  it('announces each result to screen readers', async () => {
    render(<App db={freshDb()} random={seeded(10)} />)
    await startAndWaitForCard()
    fireEvent.keyDown(window, { key: 'd' })
    await screen.findByRole('heading', { name: 'Not this time' })
    const live = document.querySelector('[aria-live="polite"]')
    expect(live?.textContent).toMatch(/^Not this time\. .+\.$/)
  })
})

describe('swiping', () => {
  const drag = (card: Element, moveTo: number, releaseAt: number) => {
    const base = { isPrimary: true, pointerId: 1, clientY: 200 }
    fireEvent.pointerDown(card, { ...base, clientX: 100 })
    fireEvent.pointerMove(card, { ...base, clientX: moveTo })
    fireEvent.pointerUp(card, { ...base, clientX: releaseAt })
  }

  it('answers when released past the threshold, even if the last move had not rendered', async () => {
    render(<App db={freshDb()} random={seeded(13)} />)
    await startAndWaitForCard()
    // The only rendered move is 10px. The release is 160px away, past the 105px threshold.
    drag(document.querySelector('.swipe-card') as Element, 110, 260)
    expect(await screen.findByRole('button', { name: 'Next' })).toBeTruthy()
  })

  it('springs back when released short of the threshold', async () => {
    const db = freshDb()
    render(<App db={db} random={seeded(14)} />)
    await startAndWaitForCard()
    drag(document.querySelector('.swipe-card') as Element, 150, 150)
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)))
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
    expect(await db.items.count()).toBe(0)
  })

  it('moves on when the feedback panel is tapped', async () => {
    render(<App db={freshDb()} random={seeded(15)} />)
    await startAndWaitForCard()
    fireEvent.keyDown(window, { key: 'd' })
    fireEvent.click(await screen.findByRole('heading', { name: 'Not this time' }))
    expect(await screen.findByRole('button', { name: 'True' })).toBeTruthy()
  })
})

describe('when saved progress cannot be read', () => {
  it('warns and does not overwrite what is stored', async () => {
    const db = freshDb()
    vi.spyOn(db.items, 'toArray').mockRejectedValue(new Error('blocked'))
    const put = vi.spyOn(db.items, 'put')
    render(<App db={db} random={seeded(11)} />)

    expect(await screen.findByRole('alert')).toBeTruthy()
    await startAndWaitForCard()
    fireEvent.click(screen.getByRole('button', { name: 'True' }))
    await screen.findByRole('button', { name: 'Next' })
    expect(put).not.toHaveBeenCalled()
  })
})

/** Saves one item as already learned to this box and tier, due now, then opens the app. */
async function openWithDueItem(id: string, box: ItemState['box'], tier: ItemState['tier']) {
  const db = freshDb()
  await db.items.put({ ...newItemState(id, Date.now() - 1000), box, tier })
  render(<App db={db} random={seeded(21)} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Start session' }))
  return db
}

const stored = async (db: FlagmaniaDb, id: string) => db.items.get(id)

describe('formats', () => {
  it('asks a box 2, tier 1 item as two options and moves it on when right', async () => {
    const db = await openWithDueItem('fr-flag-to-country', 2, 1)
    expect(await screen.findByText('Pick the country')).toBeTruthy()
    const options = document.querySelectorAll('.choice-pad .option')
    expect(options).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /France/ }))
    expect(await screen.findByRole('heading', { name: 'Right' })).toBeTruthy()
    expect(await stored(db, 'fr-flag-to-country')).toMatchObject({ box: 2, tier: 2 })
  })

  it('asks four options at tier 2, and a right answer reaches box 3', async () => {
    const db = await openWithDueItem('fr-flag-to-country', 2, 2)
    await screen.findByText('Pick the country')
    expect(document.querySelectorAll('.choice-pad .option')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: /France/ }))
    await screen.findByRole('heading', { name: 'Right' })
    expect(await stored(db, 'fr-flag-to-country')).toMatchObject({ box: 3, tier: 3 })
  })

  it('treats D as "don\'t know" on four options and drops a tier', async () => {
    const db = await openWithDueItem('fr-flag-to-country', 2, 2)
    await screen.findByText('Pick the country')
    fireEvent.keyDown(window, { key: 'd' })
    await screen.findByRole('heading', { name: 'Not this time' })
    expect(await stored(db, 'fr-flag-to-country')).toMatchObject({ box: 1, tier: 1 })
  })

  it('asks a box 3, tier 3 item as a typed answer and forgives a typo', async () => {
    const db = await openWithDueItem('fr-flag-to-country', 3, 3)
    const input = await screen.findByRole('textbox', { name: 'Country' })
    fireEvent.change(input, { target: { value: 'Frnace' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect(await screen.findByRole('heading', { name: 'Right' })).toBeTruthy()
    const feedback = document.querySelector('.feedback') as HTMLElement
    expect(within(feedback).getByText(/The usual spelling is France/)).toBeTruthy()
    expect(await stored(db, 'fr-flag-to-country')).toMatchObject({ box: 4, tier: 3 })
  })

  it('does not answer when D is typed into the answer box', async () => {
    await openWithDueItem('fr-country-to-capital', 3, 3)
    const input = await screen.findByRole('textbox', { name: 'Capital' })
    fireEvent.keyDown(input, { key: 'd' })
    expect(screen.queryByRole('heading', { name: 'Not this time' })).toBeNull()
  })

  it('accepts any capital of a country with several', async () => {
    await openWithDueItem('za-country-to-capital', 3, 3)
    const input = await screen.findByRole('textbox', { name: 'Capital' })
    fireEvent.change(input, { target: { value: 'cape town' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect(await screen.findByRole('heading', { name: 'Right' })).toBeTruthy()
    const feedback = document.querySelector('.feedback') as HTMLElement
    expect(within(feedback).getByText(/Bloemfontein or Cape Town or Pretoria/)).toBeTruthy()
  })

  it('never asks for a flag to be typed', async () => {
    await openWithDueItem('fr-country-to-flag', 5, 3)
    expect(await screen.findByText('Pick its flag')).toBeTruthy()
    expect(document.querySelectorAll('.choice-pad .option img')).toHaveLength(4)
  })
})

describe('decks', () => {
  it('switches the capitals deck off, keeps one deck on and remembers it', async () => {
    const db = freshDb()
    render(<App db={db} random={seeded(30)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Capitals' }))
    expect(await screen.findByText('0 of 390')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Flags' }).hasAttribute('disabled')).toBe(true)

    cleanup()
    render(<App db={db} random={seeded(31)} />)
    expect(await screen.findByText('0 of 390')).toBeTruthy()
  })
})
