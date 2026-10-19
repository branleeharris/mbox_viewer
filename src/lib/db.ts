import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MessageFlags, MessageMeta, SearchChunk, Settings, Source } from './types';

interface MboxDB extends DBSchema {
  sources: { key: string; value: Source };
  messages: { key: string; value: MessageMeta; indexes: { sourceId: string } };
  chunks: { key: string; value: SearchChunk; indexes: { sourceId: string } };
  flags: { key: string; value: MessageFlags };
  kv: { key: string; value: { key: string; value: unknown } };
}

const DB_NAME = 'mbox-viewer';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MboxDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<MboxDB>> {
  dbPromise ??= openDB<MboxDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('sources', { keyPath: 'id' });
      db.createObjectStore('messages', { keyPath: 'id' }).createIndex('sourceId', 'sourceId');
      db.createObjectStore('chunks', { keyPath: 'id' }).createIndex('sourceId', 'sourceId');
      db.createObjectStore('flags', { keyPath: 'id' });
      db.createObjectStore('kv', { keyPath: 'key' });
    },
    blocking() {
      // Another tab is upgrading; let it.
      void dbPromise?.then((db) => db.close());
      dbPromise = null;
    },
  });
  return dbPromise;
}

export async function loadAll(): Promise<{
  sources: Source[];
  messages: MessageMeta[];
  flags: MessageFlags[];
  settings: Partial<Settings> | undefined;
}> {
  const db = await getDB();
  const [sources, messages, flags, settings] = await Promise.all([
    db.getAll('sources'),
    db.getAll('messages'),
    db.getAll('flags'),
    db.get('kv', 'settings'),
  ]);
  return { sources, messages, flags, settings: settings?.value as Partial<Settings> | undefined };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDB();
  await db.put('kv', { key: 'settings', value: settings });
}

export async function saveFlags(flags: MessageFlags[]): Promise<void> {
  if (!flags.length) return;
  const db = await getDB();
  const tx = db.transaction('flags', 'readwrite');
  for (const f of flags) void tx.store.put(f);
  await tx.done;
}

async function deleteByIndex(store: 'messages' | 'chunks', sourceId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(store, 'readwrite');
  let cursor = await tx.store.index('sourceId').openCursor(IDBKeyRange.only(sourceId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function deleteSource(source: Source): Promise<void> {
  await deleteByIndex('messages', source.id);
  await deleteByIndex('chunks', source.id);
  const db = await getDB();
  await db.delete('sources', source.id);
  if (source.opfsName) await removeOpfsFile(source.opfsName);
}

export async function clearEverything(): Promise<void> {
  const db = await getDB();
  db.close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    // Other connections close via their `blocking` handlers; give up waiting after a while.
    req.onblocked = () => setTimeout(resolve, 5000);
  });
  let root: FileSystemDirectoryHandle;
  try {
    root = await navigator.storage.getDirectory();
  } catch {
    return; // OPFS unavailable
  }
  const names: string[] = [];
  for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name);
  for (const name of names) {
    // A file still held by a closing worker can refuse removal briefly; retry each one.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await root.removeEntry(name, { recursive: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }
}

export async function removeOpfsFile(name: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(name);
  } catch {
    /* already gone */
  }
}
