import type { SearchRequest, SearchResponse } from './search.worker';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: Map<string, Set<string>>) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SearchResponse>) => {
      const msg = e.data;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.type === 'error') p.reject(new Error(msg.message));
      else p.resolve(new Map(Object.entries(msg.matches).map(([k, v]) => [k, new Set(v)])));
    };
  }
  return worker;
}

/** Resolve each free-text term to the set of message ids containing it. */
export function searchText(terms: string[]): Promise<Map<string, Set<string>>> {
  if (!terms.length) return Promise.resolve(new Map());
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ type: 'search', id, terms } satisfies SearchRequest);
  });
}

let generation = 0;

/** Changes whenever indexed text changes; callers caching results should key on it. */
export function searchGeneration(): number {
  return generation;
}

/** Drop the worker's cache after an import batch or deletion. */
export function invalidateSearch() {
  generation++;
  worker?.postMessage({ type: 'invalidate' } satisfies SearchRequest);
}
