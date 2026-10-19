import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { MailRow } from './MailRow';
import { Icon } from './Icon';
import { Checkbox, IconButton, Menu } from './ui';
import { CATEGORIES } from '../lib/labels';
import { viewToHash, viewTitle, sameView, type View } from '../lib/router';
import { exportMbox } from '../lib/export';
import { safeFilename } from '../lib/format';

const NO_IDS: string[] = [];

export function usePageIds() {
  // Ignore a list computed for a different view (it's replaced right after navigation).
  const ids = useStore((s) => (s.list.key === viewToHash(s.route.view) ? s.list.ids : NO_IDS));
  const page = useStore((s) => s.page);
  const size = useStore((s) => s.settings.pageSize);
  return { pageIds: ids.slice(page * size, page * size + size), start: page * size, total: ids.length, size, page };
}

/** Thread ids the toolbar actions apply to. */
export function actionTargets(): string[] {
  const s = useStore.getState();
  if (s.selectAllMatching) return s.list.ids;
  return [...s.selected];
}

export async function exportThreads(threadIds: string[], name: string) {
  const s = useStore.getState();
  const msgs = threadIds.flatMap((tid) => s.threads.get(tid)?.messageIds ?? []).map((id) => s.messages.get(id)!);
  if (!msgs.length) return;
  s.showToast(`Preparing ${msgs.length.toLocaleString()} messages…`);
  const { exported, skipped } = await exportMbox(msgs, s.sources, `${safeFilename(name)}.mbox`);
  s.showToast(
    skipped
      ? `Exported ${exported.toLocaleString()} messages. ${skipped.toLocaleString()} skipped because their file isn't stored in this browser.`
      : `Exported ${exported.toLocaleString()} messages`,
  );
}

function CategoryTabs({ view }: { view: View }) {
  const unread = useStore((s) => s.counts.unread);
  const total = useStore((s) => s.counts.total);
  return (
    <div role="tablist" className="flex border-b border-line">
      {CATEGORIES.map((c) => {
        const v: View = c.id === 'primary' ? { kind: 'folder', folder: 'inbox' } : { kind: 'category', category: c.id };
        if (c.id !== 'primary' && !total.get(c.id)) return null;
        const active = sameView(view, v);
        const n = unread.get(c.id);
        return (
          <a
            key={c.id}
            role="tab"
            aria-selected={active}
            href={viewToHash(v)}
            className={`relative flex h-14 max-w-60 min-w-0 flex-1 items-center gap-4 px-4 text-sm hover:bg-hover ${active ? 'text-accent' : 'text-ink-2'}`}
          >
            <Icon name={c.icon} size={20} filled={active} />
            <span className={`truncate ${active ? 'font-medium' : ''}`}>{c.label}</span>
            {!!n && c.id !== 'primary' && (
              <span className="rounded-full bg-accent px-2 text-xs leading-5 font-medium text-surface">{n} new</span>
            )}
            {active && <span className="absolute right-2 bottom-0 left-2 h-[3px] rounded-t bg-accent" />}
          </a>
        );
      })}
    </div>
  );
}

function ListToolbar() {
  const { pageIds, start, total, size, page } = usePageIds();
  const selected = useStore((s) => s.selected);
  const selectAllMatching = useStore((s) => s.selectAllMatching);
  const threads = useStore((s) => s.threads);
  const loading = useStore((s) => s.list.loading);
  const view = useStore((s) => s.route.view);
  const { setThreadsRead, setThreadsStarred, setThreadsImportant } = useStore.getState();

  const nSel = selectAllMatching ? total : selected.size;
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const some = selected.size > 0;

  const selectWhere = (pred: (id: string) => boolean) =>
    useStore.setState({ selected: new Set(pageIds.filter(pred)), selectAllMatching: false });

  const targets = actionTargets;
  const anyUnread = [...(selectAllMatching ? [] : selected)].some((id) => threads.get(id)?.unread);
  const done = () => useStore.setState({ selected: new Set(), selectAllMatching: false });

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 pr-2 pl-2">
      <div className="flex items-center rounded hover:bg-hover">
        <Checkbox
          checked={allOnPage}
          indeterminate={some && !allOnPage}
          label="Select"
          onChange={(c) => selectWhere(() => c && !some)}
        />
        <Menu
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} aria-label="Select options" className="-ml-2 flex h-8 w-5 items-center justify-center text-ink-2">
              <Icon name="arrow_drop_down" size={20} />
            </button>
          )}
          items={[
            { label: 'All', onSelect: () => selectWhere(() => true) },
            { label: 'None', onSelect: () => selectWhere(() => false) },
            { label: 'Read', onSelect: () => selectWhere((id) => !threads.get(id)?.unread) },
            { label: 'Unread', onSelect: () => selectWhere((id) => !!threads.get(id)?.unread) },
            { label: 'Starred', onSelect: () => selectWhere((id) => !!threads.get(id)?.starred) },
            { label: 'Unstarred', onSelect: () => selectWhere((id) => !threads.get(id)?.starred) },
          ]}
        />
      </div>

      {nSel > 0 ? (
        <>
          <IconButton
            icon={anyUnread || selectAllMatching ? 'mark_email_read' : 'mark_email_unread'}
            label={anyUnread || selectAllMatching ? 'Mark as read' : 'Mark as unread'}
            onClick={() => {
              setThreadsRead(targets(), anyUnread || selectAllMatching);
              done();
            }}
          />
          <IconButton
            icon="star"
            label="Add star"
            onClick={() => {
              setThreadsStarred(targets(), true);
              done();
            }}
          />
          <IconButton
            icon="download"
            label="Export selected as .mbox"
            onClick={() => void exportThreads(targets(), `${viewTitle(view)} selection`)}
          />
          <Menu
            trigger={({ toggle }) => <IconButton icon="more_vert" label="More" onClick={toggle} />}
            items={[
              { label: 'Mark as unread', icon: 'mark_email_unread', onSelect: () => (setThreadsRead(targets(), false), done()) },
              { label: 'Mark as read', icon: 'mark_email_read', onSelect: () => (setThreadsRead(targets(), true), done()) },
              { label: 'Remove star', icon: 'star', onSelect: () => (setThreadsStarred(targets(), false), done()) },
              { label: 'Mark as important', icon: 'label_important', onSelect: () => (setThreadsImportant(targets(), true), done()) },
              { label: 'Mark as not important', icon: 'label_important', onSelect: () => (setThreadsImportant(targets(), false), done()) },
            ]}
          />
        </>
      ) : (
        <Menu
          trigger={({ toggle }) => <IconButton icon="more_vert" label="More" onClick={toggle} />}
          items={[
            {
              label: 'Mark all as read',
              icon: 'mark_email_read',
              onSelect: () => setThreadsRead(useStore.getState().list.ids, true),
            },
            {
              label: `Export all ${total.toLocaleString()} conversations as .mbox`,
              icon: 'download',
              disabled: !total,
              onSelect: () => void exportThreads(useStore.getState().list.ids, viewTitle(view)),
            },
          ]}
        />
      )}

      <div className="ml-auto flex items-center gap-1 text-xs text-ink-2">
        {loading && <span className="mr-2">Searching…</span>}
        {total > 0 && (
          <span className="mr-1 whitespace-nowrap">
            {(start + 1).toLocaleString()}–{Math.min(start + size, total).toLocaleString()} of {total.toLocaleString()}
          </span>
        )}
        <IconButton icon="chevron_left" label="Newer" disabled={page === 0} onClick={() => useStore.setState({ page: page - 1, selected: new Set(), selectAllMatching: false, cursor: 0 })} />
        <IconButton icon="chevron_right" label="Older" disabled={start + size >= total} onClick={() => useStore.setState({ page: page + 1, selected: new Set(), selectAllMatching: false, cursor: 0 })} />
      </div>
    </div>
  );
}

function SelectAllBanner() {
  const { pageIds, total } = usePageIds();
  const selected = useStore((s) => s.selected);
  const all = useStore((s) => s.selectAllMatching);
  const view = useStore((s) => s.route.view);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  if (!allOnPage || total <= pageIds.length) return null;
  const where = view.kind === 'search' ? 'this search' : viewTitle(view);
  return (
    <div className="border-b border-line bg-chip py-2 text-center text-sm text-ink">
      {all ? (
        <>
          All <b>{total.toLocaleString()}</b> conversations in {where} are selected.{' '}
          <button type="button" className="font-medium text-accent hover:underline" onClick={() => useStore.setState({ selected: new Set(), selectAllMatching: false })}>
            Clear selection
          </button>
        </>
      ) : (
        <>
          All <b>{pageIds.length}</b> conversations on this page are selected.{' '}
          <button type="button" className="font-medium text-accent hover:underline" onClick={() => useStore.setState({ selectAllMatching: true })}>
            Select all {total.toLocaleString()} conversations in {where}
          </button>
        </>
      )}
    </div>
  );
}

function EmptyState({ view }: { view: View }) {
  const error = useStore((s) => s.list.error);
  const loading = useStore((s) => s.list.loading || s.list.key !== viewToHash(s.route.view));
  if (loading) return null;
  let text = `No conversations in ${viewTitle(view)}.`;
  if (view.kind === 'folder' && view.folder === 'inbox') text = 'Your Inbox is empty.';
  if (view.kind === 'search') text = error ? `Search failed: ${error}` : 'No messages matched your search.';
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center text-sm text-ink-2">
      <p>{text}</p>
      {view.kind === 'search' && !error && (
        <p className="mt-2 text-ink-3">
          Try <code className="rounded bg-chip px-1">in:anywhere</code> to include Spam and Trash, or use the{' '}
          <Icon name="tune" size={14} className="inline align-text-bottom" /> options in the search bar.
        </p>
      )}
    </div>
  );
}

function SearchChips({ query }: { query: string }) {
  const toggle = (token: string) => {
    const has = query.split(/\s+/).includes(token);
    const next = has ? query.split(/\s+/).filter((t) => t !== token).join(' ') : `${query} ${token}`.trim();
    location.hash = '#search/' + encodeURIComponent(next);
  };
  const chips: [string, string][] = [
    ['has:attachment', 'Has attachment'],
    ['is:unread', 'Is unread'],
    ['is:starred', 'Is starred'],
    ['newer_than:7d', 'Last 7 days'],
    ['in:anywhere', 'Include Spam & Trash'],
  ];
  const tokens = query.split(/\s+/);
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-2">
      {chips.map(([tok, label]) => {
        const on = tokens.includes(tok);
        return (
          <button
            key={tok}
            type="button"
            onClick={() => toggle(tok)}
            className={`flex h-8 shrink-0 items-center gap-1 rounded-lg border px-3 text-sm ${on ? 'border-transparent bg-accent-soft text-nav-active-ink' : 'border-line-strong text-ink-2 hover:bg-hover'}`}
          >
            {on && <Icon name="check_circle" size={16} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function MailList({ split }: { split: boolean }) {
  const view = useStore((s) => s.route.view);
  const openThread = useStore((s) => s.route.threadId);
  const tabs = useStore((s) => s.counts.tabs);
  const threads = useStore((s) => s.threads);
  const selected = useStore((s) => s.selected);
  const cursor = useStore((s) => s.cursor);
  const loading = useStore((s) => s.list.loading || s.list.key !== viewToHash(s.route.view));
  const { pageIds, start } = usePageIds();
  const lastClicked = useRef<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const onOpen = useCallback(
    (id: string) => {
      location.hash = viewToHash(view) + '/' + id;
    },
    [view],
  );

  const onSelect = useCallback(
    (index: number, checked: boolean, shift: boolean) => {
      const s = useStore.getState();
      const next = new Set(s.selected);
      const ids = s.list.ids.slice(s.page * s.settings.pageSize, (s.page + 1) * s.settings.pageSize);
      if (shift && lastClicked.current != null) {
        const [a, b] = [Math.min(lastClicked.current, index), Math.max(lastClicked.current, index)];
        for (let i = a; i <= b; i++) checked ? next.add(ids[i]) : next.delete(ids[i]);
      } else {
        checked ? next.add(ids[index]) : next.delete(ids[index]);
      }
      lastClicked.current = index;
      useStore.setState({ selected: next, selectAllMatching: false, cursor: index });
    },
    [],
  );

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [start, JSON.stringify(view)]);

  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-row="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const showTabs = tabs && !split && (view.kind === 'category' || (view.kind === 'folder' && view.folder === 'inbox'));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ListToolbar />
      {loading && (
        <div className="relative h-0.5 overflow-hidden bg-accent-soft">
          <div className="animate-indeterminate absolute inset-y-0 w-2/5 bg-accent" />
        </div>
      )}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto" role="grid" aria-label="Conversations">
        {view.kind === 'search' && <SearchChips query={view.query} />}
        {showTabs && <CategoryTabs view={view} />}
        <SelectAllBanner />
        {pageIds.length === 0 ? (
          <EmptyState view={view} />
        ) : (
          pageIds.map((id, i) => {
            const t = threads.get(id);
            if (!t) return null;
            return (
              <div key={id} data-row={i}>
                <MailRow
                  thread={t}
                  index={i}
                  selected={selected.has(id)}
                  focused={cursor === i}
                  open={openThread === id}
                  split={split}
                  onOpen={onOpen}
                  onSelect={onSelect}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
