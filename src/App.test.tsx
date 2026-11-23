// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from './App.tsx'
import { seeded } from './core/random.ts'
import { openDb } from './storage/db.ts'

afterEach(cleanup)

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

describe('a first session', () => {
  it('plays through, then keeps progress after a reload', async () => {
    const db = openDb('flagmania-app-test')
    render(<App db={db} random={seeded(42)} />)

    expect(await screen.findByText('0 of 195')).toBeTruthy()

    const cards = await playSession()
    expect(cards).toBeGreaterThanOrEqual(8)

    const score = screen.getByText(/right first time/)
    expect(score.textContent).toMatch(/^\d+ of 8 right first time$/)

    // Close the page and open it again with the same database.
    cleanup()
    render(<App db={openDb('flagmania-app-test')} random={seeded(43)} />)

    expect(await screen.findByText('8 of 195')).toBeTruthy()
    const saved = await db.items.toArray()
    expect(saved).toHaveLength(8)
    expect(saved.every((item) => item.box === 1 || item.box === 2)).toBe(true)

    const boxes = screen.getByRole('figure', { name: 'Flags in each box' })
    expect(within(boxes).getByText('Box 2')).toBeTruthy()
  })

  it('answers with the keyboard as well as buttons', async () => {
    render(<App db={openDb('flagmania-keys-test')} random={seeded(7)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Start session' }))
    await screen.findByText(/This is the flag of/)

    fireEvent.keyDown(window, { key: 'd' })
    expect(await screen.findByRole('heading', { name: 'Not this time' })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Enter' })
    expect(await screen.findByRole('button', { name: 'True' })).toBeTruthy()
  })
})
