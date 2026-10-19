import { useEffect } from 'react';
import { useStore } from '../store';
import { inView } from '../lib/views';
import { viewToHash } from '../lib/router';
import { parseQuery, textTerms, highlightTerms, matchMessage, mentionsLocation } from '../lib/search/query';
import { searchText, searchGeneration } from '../lib/search/client';

// Text matches only change when indexed text changes (searchGeneration), not when flags change.
let textCache: { key: string; result: Promise<Map<string, Set<string>>> } | null = null;

function cachedSearchText(terms: string[]) {
  const key = searchGeneration() + '|' + terms.join('\u0000');
  if (textCache?.key !== key) {
    const result = searchText(terms);
    result.catch(() => (textCache = null));
    textCache = { key, result };
  }
  return textCache.result;
}

let lastQuery: string | null = null;

/** Keeps `store.list` in sync with the current view, running searches off the main thread. */
export function useListController() {
  const view = useStore((s) => s.route.view);
  const version = useStore((s) => s.version);
  const viewKey = viewToHash(view);

  useEffect(() => {
    const { threads, sortedThreads, counts } = useStore.getState();
    if (view.kind !== 'search') {
      lastQuery = null;
      const ids = sortedThreads.filter((id) => inView(threads.get(id)!, view, counts.tabs));
      useStore.setState({ list: { key: viewKey, ids, loading: false, highlight: [], error: null } });
      return;
    }

    let cancelled = false;
    const ast = parseQuery(view.query);
    const terms = textTerms(ast);
    const highlight = highlightTerms(ast);
    // Keep showing the old results only while re-running the same search (e.g. after a flag change).
    const prev = useStore.getState().list;
    const sameQuery = lastQuery === view.query;
    lastQuery = view.query;
    useStore.setState({ list: { key: viewKey, ids: sameQuery ? prev.ids : [], loading: true, highlight, error: null } });

    cachedSearchText(terms)
      .then((text) => {
        if (cancelled) return;
        const s = useStore.getState();
        const ctx = { text, me: s.settings.meAddresses };
        const includeJunk = mentionsLocation(ast);
        const ids: string[] = [];
        for (const tid of s.sortedThreads) {
          const t = s.threads.get(tid)!;
          if (t.junk && !includeJunk) continue;
          if (t.messageIds.some((mid) => matchMessage(ast, s.messages.get(mid)!, ctx))) ids.push(tid);
        }
        useStore.setState({ list: { key: viewKey, ids, loading: false, highlight, error: null } });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        useStore.setState({
          list: { key: viewKey, ids: [], loading: false, highlight, error: err instanceof Error ? err.message : String(err) },
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, version]);
}
