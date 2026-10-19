/**
 * Full-text search worker. Scans the per-message search text written during
 * import (stored in IndexedDB in chunks of a few hundred messages). Small
 * mailboxes are cached in memory after the first search; large ones are
 * streamed from IndexedDB on every query so memory stays bounded.
 */
import { getDB } from '../db';
import type { SearchChunk } from '../types';

export type SearchRequest = { type: 'search'; id: number; terms: string[] } | { type: 'invalidate' };
export type SearchResponse =
  | { type: 'result'; id: number; matches: Record<string, string[]> }
  | { type: 'error'; id: number; message: string };

/** Above this many cached characters, stop caching and stream instead. */
const CACHE_BUDGET_CHARS = 120_000_000;

const ctx = self as unknown as {
  postMessage(message: SearchResponse): void;
  onmessage: ((e: MessageEvent<SearchRequest>) => void) | null;
};

let cache: SearchChunk[] | null = null;
let cacheable = true;
let generation = 0;

async function forEachChunk(fn: (c: SearchChunk) => void): Promise<void> {
  if (cache) {
    cache.forEach(fn);
    return;
  }
  const gen = generation;
  const db = await getDB();
  const collected: SearchChunk[] = [];
  let chars = 0;
  let cursor = await db.transaction('chunks').store.openCursor();
  while (cursor) {
    const c = cursor.value;
    fn(c);
    if (cacheable) {
      collected.push(c);
      for (const t of c.texts) chars += t.length;
      if (chars > CACHE_BUDGET_CHARS) {
        cacheable = false;
        collected.length = 0;
      }
    }
    cursor = await cursor.continue();
  }
  if (cacheable && gen === generation) cache = collected;
}

ctx.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'invalidate') {
    generation++;
    cache = null;
    cacheable = true;
    return;
  }
  try {
    const terms = msg.terms.map((t) => t.toLowerCase()).filter(Boolean);
    const hits: Record<string, string[]> = Object.fromEntries(terms.map((t) => [t, []]));
    await forEachChunk((c) => {
      for (let i = 0; i < c.texts.length; i++) {
        const text = c.texts[i];
        for (const t of terms) if (text.includes(t)) hits[t].push(c.ids[i]);
      }
    });
    ctx.postMessage({ type: 'result', id: msg.id, matches: hits });
  } catch (err) {
    ctx.postMessage({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};
