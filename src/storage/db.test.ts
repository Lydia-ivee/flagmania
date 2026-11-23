import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { newItemState } from '../core/scheduler.ts'
import { loadStates, openDb, saveState } from './db.ts'

describe('storage', () => {
  const db = openDb('flagmania-storage-test')
  afterEach(() => db.items.clear())

  it('saves item states and reads them back', async () => {
    const state = { ...newItemState('fr-flag-to-country', 1000), box: 2 as const }
    await saveState(db, state)
    const loaded = await loadStates(db)
    expect(loaded.get('fr-flag-to-country')).toEqual(state)
  })

  it('overwrites an item when it is saved again', async () => {
    await saveState(db, newItemState('fr-flag-to-country', 1000))
    await saveState(db, { ...newItemState('fr-flag-to-country', 1000), box: 3 })
    const loaded = await loadStates(db)
    expect(loaded.size).toBe(1)
    expect(loaded.get('fr-flag-to-country')?.box).toBe(3)
  })
})
