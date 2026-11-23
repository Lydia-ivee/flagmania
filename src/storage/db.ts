import Dexie, { type EntityTable } from 'dexie'
import type { ItemState } from '../core/types.ts'

export type FlagmaniaDb = Dexie & { items: EntityTable<ItemState, 'id'> }

export function openDb(name = 'flagmania'): FlagmaniaDb {
  const db = new Dexie(name) as FlagmaniaDb
  db.version(1).stores({ items: 'id, dueAt' })
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
