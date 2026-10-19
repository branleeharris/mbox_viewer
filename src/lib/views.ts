import type { Thread } from './types';
import type { View } from './router';
import { L, categoryLabel, isSystemLabel, CATEGORIES, type CategoryId } from './labels';

const CATEGORY_LABELS = CATEGORIES.filter((c) => c.id !== 'primary').map((c) => categoryLabel(c.id));

export function threadCategory(t: Thread): CategoryId {
  for (const c of CATEGORIES) if (c.id !== 'primary' && t.labels.has(categoryLabel(c.id))) return c.id;
  return 'primary';
}

export function hasCategories(threads: Iterable<Thread>): boolean {
  for (const t of threads) for (const l of CATEGORY_LABELS) if (t.labels.has(l)) return true;
  return false;
}

/** Does a thread belong in a (non-search) view? */
export function inView(t: Thread, view: View, tabs: boolean): boolean {
  switch (view.kind) {
    case 'folder':
      switch (view.folder) {
        case 'inbox':
          return t.labels.has(L.inbox) && (!tabs || threadCategory(t) === 'primary');
        case 'starred':
          return t.starred && !t.junk;
        case 'important':
          return t.important && !t.junk;
        case 'sent':
          return t.labels.has(L.sent);
        case 'drafts':
          return t.labels.has(L.drafts);
        case 'chats':
          return t.labels.has(L.chats);
        case 'all':
          return !t.junk;
        case 'spam':
          return t.labels.has(L.spam);
        case 'trash':
          return t.labels.has(L.trash);
      }
      return false;
    case 'category':
      return t.labels.has(L.inbox) && threadCategory(t) === view.category;
    case 'label':
      return t.labels.has(view.label) && !t.junk;
    case 'search':
    case 'people':
      return false;
  }
}

export interface SidebarCounts {
  /** Unread thread counts keyed by folder id, category id, or label name. */
  unread: Map<string, number>;
  /** Total thread counts keyed the same way. */
  total: Map<string, number>;
  userLabels: string[];
  tabs: boolean;
}

export function computeCounts(threads: Iterable<Thread>): SidebarCounts {
  const list = [...threads];
  const tabs = hasCategories(list);
  const unread = new Map<string, number>();
  const total = new Map<string, number>();
  const labels = new Set<string>();
  const bump = (k: string, isUnread: boolean) => {
    total.set(k, (total.get(k) ?? 0) + 1);
    if (isUnread) unread.set(k, (unread.get(k) ?? 0) + 1);
  };
  for (const t of list) {
    if (t.labels.has(L.inbox)) {
      const cat = threadCategory(t);
      if (!tabs || cat === 'primary') bump('inbox', t.unread);
      bump(cat, t.unread);
    }
    if (t.starred && !t.junk) bump('starred', t.unread);
    if (t.important && !t.junk) bump('important', t.unread);
    if (t.labels.has(L.sent)) bump('sent', false);
    if (t.labels.has(L.drafts)) bump('drafts', false);
    if (t.labels.has(L.chats)) bump('chats', t.unread);
    if (!t.junk) bump('all', t.unread);
    if (t.labels.has(L.spam)) bump('spam', t.unread);
    if (t.labels.has(L.trash)) bump('trash', false);
    for (const l of t.labels) {
      if (isSystemLabel(l)) continue;
      labels.add(l);
      if (!t.junk) bump('label:' + l, t.unread);
    }
  }
  const userLabels = [...labels].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return { unread, total, userLabels, tabs };
}
