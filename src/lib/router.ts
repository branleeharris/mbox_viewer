import { SYSTEM_FOLDERS, CATEGORIES, type CategoryId, type FolderId } from './labels';

export type View =
  | { kind: 'folder'; folder: FolderId }
  | { kind: 'category'; category: CategoryId }
  | { kind: 'label'; label: string }
  | { kind: 'search'; query: string }
  /** Conversation timeline between two people (lowercase addresses; "" while not chosen yet). */
  | { kind: 'people'; a: string; b: string };

export interface Route {
  view: View;
  threadId: string | null;
}

const FOLDER_IDS = new Set<string>(SYSTEM_FOLDERS.map((f) => f.id));
const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#/, '').split('/');
  const head = parts[0] || 'inbox';
  let view: View = { kind: 'folder', folder: 'inbox' };
  let rest = parts.slice(1);
  try {
    if (FOLDER_IDS.has(head)) view = { kind: 'folder', folder: head as FolderId };
    else if (head === 'category' && CATEGORY_IDS.has(parts[1])) {
      view = parts[1] === 'primary' ? { kind: 'folder', folder: 'inbox' } : { kind: 'category', category: parts[1] as CategoryId };
      rest = parts.slice(2);
    } else if (head === 'label' && parts[1]) {
      view = { kind: 'label', label: decodeURIComponent(parts[1]) };
      rest = parts.slice(2);
    } else if (head === 'search') {
      view = { kind: 'search', query: decodeURIComponent(parts[1] ?? '') };
      rest = parts.slice(2);
    } else if (head === 'people') {
      view = { kind: 'people', a: decodeURIComponent(parts[1] ?? '').toLowerCase(), b: decodeURIComponent(parts[2] ?? '').toLowerCase() };
      rest = parts.slice(3);
    }
  } catch {
    /* malformed escape: fall back to inbox */
  }
  const threadId = rest[0] && /^[a-z0-9]+$/i.test(rest[0]) ? rest[0] : null;
  return { view, threadId };
}

export function viewToHash(view: View): string {
  switch (view.kind) {
    case 'folder':
      return '#' + view.folder;
    case 'category':
      return '#category/' + view.category;
    case 'label':
      return '#label/' + encodeURIComponent(view.label);
    case 'search':
      return '#search/' + encodeURIComponent(view.query);
    case 'people':
      // "@" is safe in a fragment; leaving it readable keeps the URL recognizable.
      return '#people/' + [view.a, view.b].map((x) => encodeURIComponent(x).replace(/%40/g, '@')).join('/');
  }
}

export function routeToHash(route: Route): string {
  return viewToHash(route.view) + (route.threadId ? '/' + route.threadId : '');
}

export function sameView(a: View, b: View): boolean {
  return viewToHash(a) === viewToHash(b);
}

export function navigate(route: Route, replace = false) {
  const hash = routeToHash(route);
  if (location.hash === hash) return;
  if (replace) history.replaceState(null, '', hash);
  else location.hash = hash;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function viewTitle(view: View): string {
  switch (view.kind) {
    case 'folder':
      return SYSTEM_FOLDERS.find((f) => f.id === view.folder)!.label;
    case 'category':
      return CATEGORIES.find((c) => c.id === view.category)!.label;
    case 'label':
      return view.label;
    case 'search':
      return 'Search results';
    case 'people':
      return 'People timeline';
  }
}
