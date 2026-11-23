import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { newItemState } from '../core/scheduler.ts'
import {
  defaultSettings,
  loadSettings,
  loadStates,
  openDb,
  saveSettings,
  saveState,
  updateItem,
} from './db.ts'

describe('storage', () => {
  const db = openDb('flagmania-storage-test')
  afterEach(async () => {
    await db.items.clear()
    await db.settings.clear()
  })

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

  it('builds on a newer saved record, so two tabs do not overwrite each other', async () => {
    const stale = { ...newItemState('fr-flag-to-country', 1000), box: 2 as const, lastSeenAt: 1000 }
    // Another tab has since moved the item to box 3.
    await saveState(db, { ...stale, box: 3, lastSeenAt: 2000, correctCount: 5 })
    const result = await updateItem(db, stale, (s) => ({ ...s, correctCount: s.correctCount + 1 }))
    expect(result).toMatchObject({ box: 3, correctCount: 6 })
    expect((await loadStates(db)).get('fr-flag-to-country')).toEqual(result)
  })

  it('uses the copy in memory when it is the newest', async () => {
    await saveState(db, { ...newItemState('fr-flag-to-country', 1000), lastSeenAt: 1000 })
    const fresh = { ...newItemState('fr-flag-to-country', 1000), box: 4 as const, lastSeenAt: 3000 }
    const result = await updateItem(db, fresh, (s) => s)
    expect(result.box).toBe(4)
  })

  it('returns default settings until some are saved', async () => {
    expect(await loadSettings(db)).toEqual(defaultSettings)
    await saveSettings(db, { decks: { flags: true, capitals: false } })
    expect(await loadSettings(db)).toEqual({ decks: { flags: true, capitals: false } })
  })
})

describe('upgrading from the M1 database', () => {
  it('keeps progress saved before settings existed', async () => {
    const old = new Dexie('flagmania-upgrade-test')
    old.version(1).stores({ items: 'id, dueAt' })
    await old.table('items').put(newItemState('fr-flag-to-country', 1000))
    old.close()

    const db = openDb('flagmania-upgrade-test')
    expect((await loadStates(db)).has('fr-flag-to-country')).toBe(true)
    expect(await loadSettings(db)).toEqual(defaultSettings)
  })
})
