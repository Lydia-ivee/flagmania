import Dexie, { type EntityTable } from 'dexie'
import type { ItemState } from '../core/types.ts'

export type DeckId = 'flags' | 'capitals'

export type Settings = {
  decks: Record<DeckId, boolean>
}

export const defaultSettings: Settings = { decks: { flags: true, capitals: true } }

type SettingsRow = { key: 'main'; value: Settings }

export type FlagmaniaDb = Dexie & {
  items: EntityTable<ItemState, 'id'>
  settings: EntityTable<SettingsRow, 'key'>
}

export function openDb(name = 'flagmania'): FlagmaniaDb {
  const db = new Dexie(name) as FlagmaniaDb
  db.version(1).stores({ items: 'id, dueAt' })
  // Version 2 adds settings. Existing progress in `items` is kept as it is.
  db.version(2).stores({ items: 'id, dueAt', settings: 'key' })
  return db
}

export async function loadStates(db: FlagmaniaDb): Promise<Map<string, ItemState>> {
  const items = await db.items.toArray()
  return new Map(items.map((item) => [item.id, item]))
}

/** Dexie writes each put in its own transaction, so a crash never leaves half a record. */
export async function saveState(db: FlagmaniaDb, state: ItemState): Promise<void> {
  await db.items.put(state)
}

export async function loadSettings(db: FlagmaniaDb): Promise<Settings> {
  const row = await db.settings.get('main')
  return { decks: { ...defaultSettings.decks, ...row?.value.decks } }
}

export async function saveSettings(db: FlagmaniaDb, settings: Settings): Promise<void> {
  await db.settings.put({ key: 'main', value: settings })
}
