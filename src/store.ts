import { create } from 'zustand';
import type { ImportProgress, MessageFlags, MessageMeta, Settings, Source, Thread } from './lib/types';
import { DEFAULT_SETTINGS } from './lib/types';
import * as db from './lib/db';
import { buildThreads, summarize } from './lib/threads';
import { computeCounts, type SidebarCounts } from './lib/views';
import { parseHash, type Route } from './lib/router';
import { registerSessionFile, forgetSource, refreshSource, setImportReader } from './lib/raw';
import { invalidateSearch } from './lib/search/client';
import { L } from './lib/labels';
import type { ImportEvent, ImportRequest } from './lib/mbox/import.worker';

export interface ThreadList {
  /** viewToHash() of the view these ids belong to. */
  key: string;
  ids: string[];
  loading: boolean;
  highlight: string[];
  error: string | null;
}

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface State {
  ready: boolean;
  fatal: string | null;
  sources: Map<string, Source>;
  messages: Map<string, MessageMeta>;
  threads: Map<string, Thread>;
  /** Thread ids, newest first. */
  sortedThreads: string[];
  msgToThread: Map<string, string>;
  counts: SidebarCounts;
  /** Bumped whenever messages/threads change, for memoization. */
  version: number;
  settings: Settings;

  importing: ImportProgress | null;
  importWarnings: string[];
  toast: Toast | null;

  route: Route;
  /** Threads in the current view, newest first (computed by useListController). */
  list: ThreadList;
  page: number;
  selected: Set<string>;
  selectAllMatching: boolean;
  /** Keyboard cursor in the list (index on current page). */
  cursor: number;

  sidebarCollapsed: boolean;
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  originalMessageId: string | null;
  printThreadId: string | null;
  printMessageId: string | null;

  init(): Promise<void>;
  importFiles(files: File[]): void;
  cancelImport(): void;
  removeSource(id: string): Promise<void>;
  /** Remove all mail. With keepPreferences, display settings survive ("Unload mailbox"). */
  clearAll(keepPreferences?: boolean): Promise<void>;
  unloadOpen: boolean;
  updateSettings(patch: Partial<Settings>): void;
  setFlags(messageIds: string[], patch: Omit<MessageFlags, 'id'>): void;
  setThreadsRead(threadIds: string[], read: boolean): void;
  setThreadsStarred(threadIds: string[], starred: boolean): void;
  setThreadsImportant(threadIds: string[], important: boolean): void;
  showToast(text: string, action?: Toast['action']): void;
  setRoute(route: Route): void;
  set(partial: Partial<State>): void;
}

const EMPTY_COUNTS: SidebarCounts = { unread: new Map(), total: new Map(), userLabels: [], tabs: false };

let worker: Worker | null = null;
let workerDone: (() => void) | null = null;
let toastSeq = 0;

/** Ask the import worker to stop and wait (briefly) so it releases its OPFS file handle. */
async function stopWorker() {
  const w = worker;
  if (!w) return;
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 5000);
    workerDone = () => {
      clearTimeout(t);
      resolve();
    };
    w.postMessage({ type: 'cancel' } satisfies ImportRequest);
  });
  w.terminate();
  setImportReader(null);
  if (worker === w) worker = null;
  workerDone = null;
}
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function applyFlags(m: MessageMeta, f: MessageFlags | undefined): MessageMeta {
  if (!f) return m;
  return {
    ...m,
    unread: f.unread ?? m.unread,
    starred: f.starred ?? m.starred,
    important: f.important ?? m.important,
  };
}

function rebuild(messages: Map<string, MessageMeta>, me: string[]) {
  const threads = buildThreads(messages.values(), me);
  const msgToThread = new Map<string, string>();
  for (const t of threads.values()) for (const id of t.messageIds) msgToThread.set(id, t.id);
  const sortedThreads = [...threads.values()].sort((a, b) => b.lastDate - a.lastDate).map((t) => t.id);
  return { threads, msgToThread, sortedThreads, counts: computeCounts(threads.values()) };
}

/** Google Vault names exports "<name>_Export--<address>-<id>.mbox"; each export's account is "me". */
function vaultOwners(sources: Iterable<Source>): string[] {
  const out = new Set<string>();
  for (const src of sources) {
    const m = /--([^\s/@]+@[^\s/]+?)-[A-Za-z0-9_]+\.mbox$/i.exec(src.name);
    if (m) out.add(m[1].toLowerCase());
  }
  return [...out];
}

/** Guess which addresses belong to the mailbox owner, for "me" and "to me". */
function detectMe(messages: Iterable<MessageMeta>): string[] {
  const sent = new Map<string, number>();
  const delivered = new Map<string, number>();
  let total = 0;
  for (const m of messages) {
    total++;
    if (m.labels.includes(L.sent) && m.from.address) sent.set(m.from.address, (sent.get(m.from.address) ?? 0) + 1);
    if (m.deliveredTo) delivered.set(m.deliveredTo, (delivered.get(m.deliveredTo) ?? 0) + 1);
  }
  const top = (map: Map<string, number>, minShare: number) => {
    const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
    if (!entries.length) return [];
    const max = entries[0][1];
    return entries.filter(([, n]) => n >= max * minShare).slice(0, 3).map(([a]) => a);
  };
  const fromSent = top(sent, 0.1);
  if (fromSent.length) return fromSent;
  const fromDelivered = top(delivered, 0.2);
  if (fromDelivered.length && (delivered.get(fromDelivered[0]) ?? 0) > total * 0.2) return fromDelivered;
  return [];
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  fatal: null,
  sources: new Map(),
  messages: new Map(),
  threads: new Map(),
  sortedThreads: [],
  msgToThread: new Map(),
  counts: EMPTY_COUNTS,
  version: 0,
  settings: DEFAULT_SETTINGS,
  importing: null,
  importWarnings: [],
  toast: null,
  route: parseHash(location.hash),
  list: { key: '', ids: [], loading: false, highlight: [], error: null },
  page: 0,
  selected: new Set(),
  selectAllMatching: false,
  cursor: 0,
  sidebarCollapsed: typeof window !== 'undefined' && window.innerWidth < 900,
  settingsOpen: false,
  shortcutsOpen: false,
  originalMessageId: null,
  printThreadId: null,
  printMessageId: null,
  unloadOpen: false,

  set: (partial) => set(partial),

  async init() {
    try {
      const { sources, messages, flags, settings } = await db.loadAll();
      const flagMap = new Map(flags.map((f) => [f.id, f]));
      const msgMap = new Map<string, MessageMeta>();
      for (const m of messages) msgMap.set(m.id, applyFlags(m, flagMap.get(m.id)));
      set({
        sources: new Map(sources.map((s) => [s.id, s])),
        messages: msgMap,
        settings: { ...DEFAULT_SETTINGS, ...settings },
        ...rebuild(msgMap, { ...DEFAULT_SETTINGS, ...settings }.meAddresses),
        version: get().version + 1,
        ready: true,
      });
    } catch (err) {
      set({ ready: true, fatal: err instanceof Error ? err.message : String(err) });
    }
  },

  importFiles(files) {
    if (!files.length) return;
    if (worker) {
      get().showToast('An import is already running.');
      return;
    }
    const totalBytes = files.reduce((n, f) => n + f.size, 0);
    set({
      importing: {
        fileName: files[0].name,
        fileIndex: 0,
        fileCount: files.length,
        bytesRead: 0,
        totalBytes,
        messages: 0,
        duplicates: 0,
      },
      importWarnings: [],
    });
    const w = new Worker(new URL('./lib/mbox/import.worker.ts', import.meta.url), { type: 'module' });
    worker = w;
    // Let the reader open messages whose extracted copy is still being written.
    const reads = new Map<number, { resolve: (b: Uint8Array) => void; reject: (e: Error) => void }>();
    let readSeq = 0;
    setImportReader(
      (sourceId, offset, length) =>
        new Promise((resolve, reject) => {
          const id = ++readSeq;
          reads.set(id, { resolve, reject });
          w.postMessage({ type: 'read', id, sourceId, offset, length } satisfies ImportRequest);
        }),
    );
    const endReads = () => {
      setImportReader(null);
      for (const r of reads.values()) r.reject(new Error('import finished'));
      reads.clear();
    };
    const pending: MessageMeta[] = [];
    let lastRebuild = 0;
    let imported = 0;
    let duplicates = 0;
    const startedEmpty = get().messages.size === 0;

    const flushPending = (force: boolean) => {
      const now = performance.now();
      if (!pending.length || (!force && now - lastRebuild < 1500)) return;
      lastRebuild = now;
      const messages = new Map(get().messages);
      for (const m of pending) messages.set(m.id, m);
      pending.length = 0;
      invalidateSearch();
      set({ messages, ...rebuild(messages, get().settings.meAddresses), version: get().version + 1 });
    };

    w.onmessage = (e: MessageEvent<ImportEvent>) => {
      const ev = e.data;
      switch (ev.type) {
        case 'read-result': {
          const r = reads.get(ev.id);
          reads.delete(ev.id);
          if (r) ev.bytes ? r.resolve(ev.bytes) : r.reject(new Error(ev.error ?? 'read failed'));
          break;
        }
        case 'source': {
          refreshSource(ev.source.id);
          if (ev.file) registerSessionFile(ev.source.id, ev.file);
          const sources = new Map(get().sources);
          sources.set(ev.source.id, ev.source);
          set({ sources });
          // Sent once when a file starts (counts are 0) and once when it ends.
          imported += ev.source.messageCount;
          duplicates += ev.source.duplicateCount;
          break;
        }
        case 'batch':
          pending.push(...ev.messages);
          flushPending(false);
          break;
        case 'progress': {
          set({
            importing: {
              fileName: ev.fileName,
              fileIndex: ev.fileIndex,
              fileCount: ev.fileCount,
              bytesRead: ev.bytesRead,
              totalBytes: ev.totalBytes,
              messages: imported + ev.messages,
              duplicates: duplicates + ev.duplicates,
            },
          });
          break;
        }
        case 'warning':
          set({ importWarnings: [...get().importWarnings, ev.message] });
          break;
        case 'done':
        case 'error': {
          if (workerDone) {
            // clearAll() is waiting; it handles teardown.
            workerDone();
            break;
          }
          flushPending(true);
          endReads();
          w.terminate();
          worker = null;
          invalidateSearch();
          set({ importing: null });
          if (ev.type === 'error') {
            get().showToast(`Import failed: ${ev.message}`);
            break;
          }
          // A file whose messages were all duplicates adds nothing; don't list it as a mailbox.
          for (const src of get().sources.values()) {
            if (src.complete && src.messageCount === 0 && src.duplicateCount > 0) void get().removeSource(src.id);
          }
          const s = get();
          // Vault owners are certain, so they're always added; otherwise guess only when unknown.
          const known = s.settings.meAddresses;
          const vault = vaultOwners(s.sources.values());
          const me = vault.length ? [...new Set([...known, ...vault])] : known.length ? known : detectMe(s.messages.values());
          if (me.join() !== known.join()) s.updateSettings({ meAddresses: me });
          const dupText = duplicates ? ` · ${duplicates.toLocaleString()} duplicates skipped` : '';
          // Warnings (skipped zip/non-mail files, storage limits) must outlive the progress card.
          const warnText = s.importWarnings.join(' ');
          const summary = ev.cancelled
            ? `Import stopped. ${imported.toLocaleString()} messages kept.`
            : imported === 0 && duplicates > 0
              ? `All ${duplicates.toLocaleString()} messages were already in your mailbox`
              : imported === 0 && warnText
                ? ''
                : `Imported ${imported.toLocaleString()} messages${dupText}`;
          s.showToast([summary, warnText].filter(Boolean).join('. '));
          // A Takeout of a single label may have nothing in the Inbox.
          if (startedEmpty && !s.counts.total.get('inbox') && s.messages.size) {
            location.hash = '#all';
          }
          break;
        }
      }
    };
    w.onerror = (e) => {
      endReads();
      w.terminate();
      worker = null;
      set({ importing: null });
      get().showToast(`Import failed: ${e.message || 'worker error'}`);
    };
    const existingKeys = [...get().messages.values()].map((m) => m.dedupeKey);
    w.postMessage({ type: 'import', files, existingKeys } satisfies ImportRequest);
  },

  cancelImport() {
    worker?.postMessage({ type: 'cancel' } satisfies ImportRequest);
  },

  async removeSource(id) {
    const source = get().sources.get(id);
    if (!source) return;
    await db.deleteSource(source);
    forgetSource(id);
    const sources = new Map(get().sources);
    sources.delete(id);
    const messages = new Map([...get().messages].filter(([, m]) => m.sourceId !== id));
    invalidateSearch();
    set({ sources, messages, ...rebuild(messages, get().settings.meAddresses), version: get().version + 1, selected: new Set() });
  },

  async clearAll(keepPreferences = false) {
    await stopWorker();
    await db.clearEverything();
    for (const id of get().sources.keys()) forgetSource(id);
    invalidateSearch();
    const prev = get().settings;
    // The owner and trusted senders belong to the mail being removed; display preferences don't.
    const settings = keepPreferences ? { ...prev, meAddresses: [], trustedImageSenders: [] } : DEFAULT_SETTINGS;
    if (keepPreferences) {
      await db.saveSettings(settings);
    } else {
      try {
        localStorage.removeItem('mbox-theme');
      } catch {
        /* ignore */
      }
    }
    const empty = new Map<string, MessageMeta>();
    set({
      sources: new Map(),
      messages: empty,
      ...rebuild(empty, []),
      version: get().version + 1,
      settings,
      unloadOpen: false,
      page: 0,
      cursor: 0,
      selectAllMatching: false,
      importing: null,
      selected: new Set(),
      settingsOpen: false,
    });
    location.hash = '#inbox';
  },

  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings, ...(patch.pageSize ? { page: 0, cursor: 0 } : {}) });
    // Folder placement of label-less mail depends on who "me" is.
    if (patch.meAddresses) set({ ...rebuild(get().messages, settings.meAddresses), version: get().version + 1 });
    if (patch.theme) {
      try {
        localStorage.setItem('mbox-theme', patch.theme);
      } catch {
        /* ignore */
      }
    }
    void db.saveSettings(settings);
  },

  setFlags(messageIds, patch) {
    const s = get();
    const messages = new Map(s.messages);
    const threads = new Map(s.threads);
    const touched = new Set<string>();
    const records: MessageFlags[] = [];
    for (const id of messageIds) {
      const m = messages.get(id);
      if (!m) continue;
      const next = { ...m, ...patch };
      if (next.unread === m.unread && next.starred === m.starred && next.important === m.important) continue;
      messages.set(id, next);
      records.push({ id, unread: next.unread, starred: next.starred, important: next.important });
      const tid = s.msgToThread.get(id);
      if (tid) touched.add(tid);
    }
    if (!records.length) return;
    for (const tid of touched) {
      const t = threads.get(tid)!;
      threads.set(tid, summarize(tid, t.messageIds.map((id) => messages.get(id)!), s.settings.meAddresses));
    }
    set({ messages, threads, counts: computeCounts(threads.values()), version: s.version + 1 });
    void db.saveFlags(records);
  },

  setThreadsRead(threadIds, read) {
    const s = get();
    const ids: string[] = [];
    for (const tid of threadIds) {
      const t = s.threads.get(tid);
      if (!t) continue;
      if (read) ids.push(...t.messageIds);
      else ids.push(t.messageIds[t.messageIds.length - 1]);
    }
    s.setFlags(ids, { unread: !read });
  },

  setThreadsStarred(threadIds, starred) {
    const s = get();
    const ids: string[] = [];
    for (const tid of threadIds) {
      const t = s.threads.get(tid);
      if (!t) continue;
      if (starred) ids.push(t.messageIds[t.messageIds.length - 1]);
      else ids.push(...t.messageIds);
    }
    s.setFlags(ids, { starred });
  },

  setThreadsImportant(threadIds, important) {
    const s = get();
    s.setFlags(threadIds.flatMap((tid) => s.threads.get(tid)?.messageIds ?? []), { important });
  },

  showToast(text, action) {
    clearTimeout(toastTimer);
    const id = ++toastSeq;
    set({ toast: { id, text, action } });
    // Longer messages stay up longer so they can be read.
    toastTimer = setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, Math.min(15000, 5000 + text.length * 50));
  },

  setRoute(route) {
    const prev = get().route;
    const viewChanged = JSON.stringify(prev.view) !== JSON.stringify(route.view);
    set({
      route,
      ...(viewChanged ? { page: 0, selected: new Set<string>(), selectAllMatching: false, cursor: 0 } : {}),
    });
  },
}));
