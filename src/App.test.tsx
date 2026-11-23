// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App.tsx'
import { countries } from './data/countries.ts'
import { seeded } from './core/random.ts'
import { openDb } from './storage/db.ts'

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

/** Reads the card on screen and returns the button that answers it correctly. */
const rightAnswerButton = () => {
  const src = document.querySelector('.swipe-card img')?.getAttribute('src') ?? ''
  const shown = countries.find((c) => src.endsWith(`/${c.iso2}.svg`))
  const claimed = document.querySelector('.claim strong')?.textContent
  return screen.getByRole('button', { name: shown?.name === claimed ? 'True' : 'False' })
}

const startAndWaitForCard = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Start session' }))
  await screen.findByText(/This is the flag of/)
}

describe('a first session', () => {
  it('plays through, then keeps progress after a reload', async () => {
    const db = freshDb()
    render(<App db={db} random={seeded(42)} />)
    expect(await screen.findByText('0 of 195')).toBeTruthy()

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
    expect(await screen.findByText('8 of 195')).toBeTruthy()
    const boxes = screen.getByRole('figure', { name: 'Flags in each box' })
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
    expect(live?.textContent).toMatch(/^Not this time\. This is the flag of .+\.$/)
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
