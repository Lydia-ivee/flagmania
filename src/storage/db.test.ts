import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { newItemState } from '../core/scheduler.ts'
import { defaultSettings, loadSettings, loadStates, openDb, saveSettings, saveState } from './db.ts'

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
