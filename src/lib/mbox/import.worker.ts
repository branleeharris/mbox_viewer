/**
 * Import worker: streams mbox data (plain files, or mbox files inside zip/tgz
 * archives) in chunks, splits it at the byte level, parses each message, and
 * writes metadata + search text to IndexedDB. The mbox bytes are copied into the
 * origin-private file system (OPFS) in the same pass so messages can be re-opened
 * after a page reload. While an extracted copy is still being written, the main
 * thread reads messages from it through 'read' requests.
 */
import { getDB } from '../db';
import type { MessageMeta, SearchChunk, Source } from '../types';
import { extractMessage } from './extract';
import { MboxSplitter, type RawMessage } from './splitter';
import { planFile, openPlan, type MailStream, type Plan, type Progress } from './archive';

export type ImportRequest =
  | { type: 'import'; files: File[]; existingKeys: string[] }
  | { type: 'read'; id: number; sourceId: string; offset: number; length: number }
  | { type: 'cancel' };

export type ImportEvent =
  /** `file` is set when the mbox bytes are readable from a Blob this session (plain files, or in-memory fallback). */
  | { type: 'source'; source: Source; file?: Blob }
  | { type: 'read-result'; id: number; bytes?: Uint8Array; error?: string }
  | {
      type: 'progress';
      fileName: string;
      fileIndex: number;
      fileCount: number;
      bytesRead: number;
      totalBytes: number;
      messages: number;
      duplicates: number;
    }
  | { type: 'batch'; messages: MessageMeta[] }
  | { type: 'warning'; message: string }
  | { type: 'done'; cancelled: boolean }
  | { type: 'error'; message: string };

const BATCH_SIZE = 400;

// Typed minimally: the DOM and WebWorker libs conflict in a single tsconfig.
const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent<ImportRequest>) => void) | null;
};

let cancelled = false;

function post(ev: ImportEvent) {
  ctx.postMessage(ev);
}

ctx.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'cancel') {
    cancelled = true;
    return;
  }
  if (msg.type === 'read') {
    const w = activeWriters.get(msg.sourceId);
    if (!w) {
      post({ type: 'read-result', id: msg.id, error: 'not importing' });
      return;
    }
    const bytes = new Uint8Array(msg.length);
    const n = w.read(bytes, msg.offset);
    ctx.postMessage({ type: 'read-result', id: msg.id, bytes: bytes.subarray(0, n) } satisfies ImportEvent);
    return;
  }
  if (msg.type === 'import') {
    cancelled = false;
    runImport(msg.files, new Set(msg.existingKeys)).catch((err: unknown) => {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    });
  }
};

function shortId(): string {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 8);
}

interface OpfsWriter {
  write(chunk: Uint8Array, at: number): void;
  read(into: Uint8Array, at: number): number;
  close(): void;
}

/** Writers for sources currently being imported, so the UI can read from them. */
const activeWriters = new Map<string, OpfsWriter>();

async function openOpfsWriter(name: string, size: number): Promise<OpfsWriter | string> {
  try {
    if (!navigator.storage?.getDirectory) return 'This browser has no private file storage.';
    const est = await navigator.storage.estimate();
    const free = (est.quota ?? 0) - (est.usage ?? 0);
    if (size && free < size * 1.1) {
      return `Not enough browser storage to keep a copy (${Math.round(free / 1e6)} MB free).`;
    }
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(name, { create: true });
    const access = await (fh as FileSystemFileHandle & {
      createSyncAccessHandle(): Promise<{
        write(b: Uint8Array, o: { at: number }): number;
        read(b: Uint8Array, o: { at: number }): number;
        truncate(n: number): void;
        flush(): void;
        close(): void;
      }>;
    }).createSyncAccessHandle();
    access.truncate(0);
    return {
      write(chunk, at) {
        access.write(chunk, { at });
      },
      read(into, at) {
        return access.read(into, { at });
      },
      close() {
        access.flush();
        access.close();
      },
    };
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

async function runImport(files: File[], existingKeys: Set<string>) {
  const db = await getDB();
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* best effort */
  }
  const warn = (message: string) => post({ type: 'warning', message });

  // Plan every file first (cheap: zips are indexed from their central directory)
  // so progress can be reported against the real total.
  const plans: Plan[] = [];
  for (const file of files) {
    const plan = await planFile(file);
    if (typeof plan === 'string') warn(plan);
    else plans.push(plan);
  }
  const totalBytes = plans.reduce((n, p) => n + p.total, 0);
  const progress: Progress = { read: 0 };

  for (let pi = 0; pi < plans.length && !cancelled; pi++) {
    try {
      for await (const stream of openPlan(plans[pi], progress, warn)) {
        if (cancelled) break;
        await importStream(stream, {
          db,
          existingKeys,
          report: (name, messages, duplicates) =>
            post({
              type: 'progress',
              fileName: name,
              fileIndex: pi,
              fileCount: plans.length,
              bytesRead: progress.read,
              totalBytes,
              messages,
              duplicates,
            }),
        });
      }
    } catch (err) {
      warn(`"${plans[pi].file.name}" couldn't be fully read: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  post({ type: 'done', cancelled });
}

interface StreamContext {
  db: Awaited<ReturnType<typeof getDB>>;
  existingKeys: Set<string>;
  report: (name: string, messages: number, duplicates: number) => void;
}

async function importStream(stream: MailStream, { db, existingKeys, report }: StreamContext) {
  const sourceId = shortId();
  const opfsName = `${sourceId}.mbox`;
  const writerOrReason = await openOpfsWriter(opfsName, stream.sizeHint);
  const writer = typeof writerOrReason === 'string' ? null : writerOrReason;
  // Without OPFS, extracted data is kept as Blob pieces (the browser may page them to disk).
  const memoryParts: Blob[] | null = !writer && !stream.file ? [] : null;
  if (!writer) {
    post({
      type: 'warning',
      message: `"${stream.name}" will be available until you close this tab, but won't be saved in the browser. ${writerOrReason}`,
    });
  }

  const source: Source = {
    id: sourceId,
    name: stream.name,
    archive: stream.archive,
    size: stream.sizeHint,
    importedAt: Date.now(),
    messageCount: 0,
    duplicateCount: 0,
    persisted: !!writer,
    opfsName: writer ? opfsName : undefined,
    complete: false,
  };
  await db.put('sources', source);
  if (writer) activeWriters.set(sourceId, writer);
  post({ type: 'source', source, file: stream.file });

  const splitter = new MboxSplitter();
  let index = 0;
  let chunkNo = 0;
  let batch: MessageMeta[] = [];
  let texts: string[] = [];
  let lastProgress = 0;

  const flush = async () => {
    if (!batch.length) return;
    const chunk: SearchChunk = {
      id: `${sourceId}:${chunkNo++}`,
      sourceId,
      ids: batch.map((m) => m.id),
      texts,
    };
    const tx = db.transaction(['messages', 'chunks'], 'readwrite');
    for (const m of batch) void tx.objectStore('messages').put(m);
    void tx.objectStore('chunks').put(chunk);
    await tx.done;
    post({ type: 'batch', messages: batch });
    batch = [];
    texts = [];
  };

  const handle = async (raw: RawMessage) => {
    let extracted;
    try {
      extracted = await extractMessage(raw.bytes);
    } catch (err) {
      // Keep unparseable messages visible rather than silently dropping them.
      extracted = {
        meta: {
          headerOffset: 0,
          length: raw.bytes.length,
          messageId: '',
          dedupeKey: `broken|${sourceId}|${raw.offset}`,
          references: [],
          from: { name: 'Unreadable message', address: '' },
          to: [],
          cc: [],
          bcc: [],
          replyTo: [],
          subject: `(could not parse message at byte ${raw.offset})`,
          date: 0,
          snippet: err instanceof Error ? err.message : String(err),
          labels: ['\\Inbox'],
          attachments: [],
          unread: false,
          starred: false,
          important: false,
        },
        searchText: '',
      };
    }
    if (existingKeys.has(extracted.meta.dedupeKey)) {
      source.duplicateCount++;
      return;
    }
    existingKeys.add(extracted.meta.dedupeKey);
    batch.push({ ...extracted.meta, id: `${sourceId}:${index++}`, sourceId, offset: raw.offset });
    texts.push(extracted.searchText);
    if (batch.length >= BATCH_SIZE) await flush();
  };

  const reportProgress = (force = false) => {
    const now = performance.now();
    if (!force && now - lastProgress < 150) return;
    lastProgress = now;
    report(stream.name, index, source.duplicateCount);
  };

  let pos = 0;
  try {
    for await (const chunk of stream.chunks) {
      if (cancelled) break;
      // Write before parsing, so any message the UI lists is already readable.
      writer?.write(chunk, pos);
      memoryParts?.push(new Blob([chunk as BlobPart]));
      pos += chunk.length;
      for (const raw of splitter.push(chunk)) {
        await handle(raw);
        if (cancelled) break;
      }
      reportProgress();
    }
    if (!cancelled) for (const raw of splitter.end()) await handle(raw);
    await flush();
  } finally {
    activeWriters.delete(sourceId);
    writer?.close();
  }

  source.size = pos;
  source.messageCount = index;
  source.complete = !cancelled;
  await db.put('sources', source);
  post({ type: 'source', source, file: stream.file ?? (memoryParts ? new Blob(memoryParts) : undefined) });
  reportProgress(true);
}
