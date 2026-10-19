import { useEffect } from 'react';
import { useStore } from '../store';
import { viewToHash } from '../lib/router';

export const SHORTCUTS: [string, string][] = [
  ['j / k', 'Older / newer conversation'],
  ['o or Enter', 'Open conversation'],
  ['u', 'Back to conversation list'],
  ['n / p', 'Next / previous message in conversation'],
  ['x', 'Select conversation'],
  ['s', 'Star / unstar'],
  ['Shift + i', 'Mark as read'],
  ['Shift + u', 'Mark as unread'],
  ['+ / -', 'Mark important / not important'],
  ['/', 'Search mail'],
  ['* then a / n / r / u', 'Select all / none / read / unread'],
  ['g then i', 'Go to Inbox'],
  ['g then s', 'Go to Starred'],
  ['g then t', 'Go to Sent'],
  ['g then d', 'Go to Drafts'],
  ['g then a', 'Go to All Mail'],
  ['[ / ]', 'Previous / next page'],
  ['Ctrl/⌘ + p', 'Print conversation'],
  ['?', 'Show keyboard shortcuts'],
];

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (e.key === 'Enter' && t.closest('button, a, [role=button], [role=menuitem]')) return true;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

export function useShortcuts() {
  useEffect(() => {
    let prefix: 'g' | '*' | null = null;
    let prefixTimer: ReturnType<typeof setTimeout> | undefined;

    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      // Ctrl/Cmd+P prints the open conversation instead of the app chrome.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p' && s.route.threadId) {
        e.preventDefault();
        useStore.setState({ printThreadId: s.route.threadId, printMessageId: null });
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      if (s.settingsOpen || s.originalMessageId || s.unloadOpen || (s.shortcutsOpen && e.key !== 'Escape' && e.key !== '?')) return;

      const { route, list, page, settings } = s;
      const size = settings.pageSize;
      const pageIds = list.ids.slice(page * size, page * size + size);
      const inThread = !!route.threadId;
      const split = settings.readingPane === 'right';
      const key = e.key;

      if (prefix) {
        const p = prefix;
        prefix = null;
        clearTimeout(prefixTimer);
        if (p === 'g') {
          const dest: Record<string, string> = { i: '#inbox', s: '#starred', t: '#sent', d: '#drafts', a: '#all', k: '#important' };
          if (dest[key]) {
            e.preventDefault();
            location.hash = dest[key];
          }
        } else if (p === '*') {
          const pick = (pred: (id: string) => boolean) =>
            useStore.setState({ selected: new Set(pageIds.filter(pred)), selectAllMatching: false });
          if (key === 'a') pick(() => true);
          else if (key === 'n') pick(() => false);
          else if (key === 'r') pick((id) => !s.threads.get(id)?.unread);
          else if (key === 'u') pick((id) => !!s.threads.get(id)?.unread);
          else if (key === 's') pick((id) => !!s.threads.get(id)?.starred);
          else if (key === 't') pick((id) => !s.threads.get(id)?.starred);
        }
        return;
      }

      const current = inThread ? route.threadId! : pageIds[s.cursor];
      const targets = s.selected.size ? [...s.selected] : current ? [current] : [];
      const openAt = (idx: number) => {
        const id = list.ids[idx];
        if (id) location.hash = viewToHash(route.view) + '/' + id;
      };

      switch (key) {
        case 'g':
        case '*':
          prefix = key;
          prefixTimer = setTimeout(() => (prefix = null), 1500);
          return;
        case '?':
          useStore.setState({ shortcutsOpen: !s.shortcutsOpen });
          break;
        case 'Escape':
          if (s.shortcutsOpen) useStore.setState({ shortcutsOpen: false });
          else return;
          break;
        case '/':
          window.dispatchEvent(new Event('mv:focus-search'));
          break;
        case 'j':
        case 'k': {
          const d = key === 'j' ? 1 : -1;
          if (inThread && !split) {
            openAt(list.ids.indexOf(route.threadId!) + d);
          } else {
            const base = inThread ? list.ids.indexOf(route.threadId!) - page * size : s.cursor;
            const next = base + d;
            if (next >= 0 && next < pageIds.length) {
              useStore.setState({ cursor: next });
              if (split) openAt(page * size + next);
            } else if (next >= pageIds.length && (page + 1) * size < list.ids.length) {
              useStore.setState({ page: page + 1, cursor: 0 });
            } else if (next < 0 && page > 0) {
              useStore.setState({ page: page - 1, cursor: size - 1 });
            }
          }
          break;
        }
        case 'o':
        case 'Enter':
          if (!inThread || split) {
            if (pageIds[s.cursor]) openAt(page * size + s.cursor);
          } else return;
          break;
        case 'u':
          if (inThread) location.hash = viewToHash(route.view);
          else return;
          break;
        case 'n':
        case 'p':
          if (inThread) window.dispatchEvent(new CustomEvent('mv:message-nav', { detail: key === 'n' ? 1 : -1 }));
          else return;
          break;
        case 'x':
          if (!inThread && current) {
            const sel = new Set(s.selected);
            sel.has(current) ? sel.delete(current) : sel.add(current);
            useStore.setState({ selected: sel, selectAllMatching: false });
          } else return;
          break;
        case 's': {
          if (!targets.length) return;
          const starred = targets.every((id) => s.threads.get(id)?.starred);
          s.setThreadsStarred(targets, !starred);
          break;
        }
        case 'I':
          if (!targets.length) return;
          s.setThreadsRead(targets, true);
          break;
        case 'U':
          if (!targets.length) return;
          s.setThreadsRead(targets, false);
          if (inThread) location.hash = viewToHash(route.view);
          break;
        case '+':
        case '=':
          if (!targets.length) return;
          s.setThreadsImportant(targets, true);
          break;
        case '-':
          if (!targets.length) return;
          s.setThreadsImportant(targets, false);
          break;
        case '[':
          if (page > 0) useStore.setState({ page: page - 1, cursor: 0, selected: new Set() });
          break;
        case ']':
          if ((page + 1) * size < list.ids.length) useStore.setState({ page: page + 1, cursor: 0, selected: new Set() });
          break;
        default:
          return;
      }
      e.preventDefault();
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(prefixTimer);
    };
  }, []);
}
