import { describe, expect, it } from 'vitest'
import { seeded } from './random.ts'
import { newItemState } from './scheduler.ts'
import {
  buildSession,
  isFinished,
  maxRepeats,
  recordAnswer,
  spreadBy,
  startSession,
} from './session.ts'
import type { ItemState } from './types.ts'

const now = Date.UTC(2026, 10, 23, 8)
const ids = Array.from({ length: 30 }, (_, i) => `i${i}`)
const options = { length: 10, newPerSession: 4 }

const stateFor = (id: string, dueAt: number): ItemState => ({ ...newItemState(id, now), dueAt })

describe('buildSession', () => {
  it('fills an empty history with new items up to the cap', () => {
    const queue = buildSession(ids, new Map(), now, options, seeded(1))
    expect(queue).toHaveLength(4)
    expect(new Set(queue).size).toBe(4)
  })

  it('puts due items in before new ones and skips items not yet due', () => {
    const states = new Map([
      ['i0', stateFor('i0', now - 1000)],
      ['i1', stateFor('i1', now)],
      ['i2', stateFor('i2', now + 86_400_000)],
    ])
    const queue = buildSession(ids, states, now, options, seeded(2))
    expect(queue.slice(0, 2)).toEqual(['i0', 'i1'])
    expect(queue).not.toContain('i2')
    expect(queue).toHaveLength(6)
  })

  it('takes the most overdue items when more are due than fit', () => {
    const states = new Map(ids.map((id, i) => [id, stateFor(id, now - i * 1000)]))
    const queue = buildSession(ids, states, now, options, seeded(3))
    expect(queue.sort()).toEqual(ids.slice(20).sort())
  })
})

describe('buildSession with regions', () => {
  it('keeps every due item ahead of every new one', () => {
    // All due items share a region, so spreading them across the session would be tempting.
    const groupOf = (id: string) => (['i0', 'i1', 'i2'].includes(id) ? 'EU' : `R${id}`)
    const states = new Map(['i0', 'i1', 'i2'].map((id) => [id, stateFor(id, now - 1000)]))
    for (let seed = 0; seed < 20; seed++) {
      const queue = buildSession(ids, states, now, options, seeded(seed), groupOf)
      expect(queue.slice(0, 3).sort()).toEqual(['i0', 'i1', 'i2'])
    }
  })
})

describe('spreadBy', () => {
  const regions: Record<string, string> = { a: 'EU', b: 'EU', c: 'EU', d: 'AF', e: 'AS', f: 'AF' }
  const regionOf = (id: string) => regions[id] ?? ''

  it('stops neighbours sharing a region when it can', () => {
    const spread = spreadBy(['a', 'b', 'c', 'd', 'e', 'f'], regionOf)
    expect(spread.slice().sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    for (let i = 1; i < spread.length; i++) {
      expect(regionOf(spread[i] as string)).not.toBe(regionOf(spread[i - 1] as string))
    }
  })

  it('keeps the original order when every item shares a region', () => {
    expect(spreadBy(['a', 'b', 'c'], regionOf)).toEqual(['a', 'b', 'c'])
  })
})

describe('recordAnswer', () => {
  const queue = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

  it('removes a correctly answered card', () => {
    const next = recordAnswer(startSession(queue), true, seeded(1))
    expect(next.queue).toEqual(queue.slice(1))
    expect(next.firstAnswers).toEqual({ a: true })
  })

  it('puts a missed card back 3 to 5 places later', () => {
    for (let seed = 0; seed < 50; seed++) {
      const next = recordAnswer(startSession(queue), false, seeded(seed))
      const position = next.queue.indexOf('a')
      expect(position).toBeGreaterThanOrEqual(3)
      expect(position).toBeLessThanOrEqual(5)
    }
  })

  it('keeps the first answer when a card comes back', () => {
    let session = recordAnswer(startSession(['a']), false, seeded(1))
    session = recordAnswer(session, true, seeded(1))
    expect(session.firstAnswers).toEqual({ a: false })
    expect(isFinished(session)).toBe(true)
  })

  it('stops repeating a card after the limit so a session always ends', () => {
    let session = startSession(['a'])
    while (!isFinished(session)) session = recordAnswer(session, false, seeded(1))
    expect(session.answered).toBe(maxRepeats + 1)
  })
})
