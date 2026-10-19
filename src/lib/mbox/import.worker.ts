/**
 * Import worker: streams mbox files in chunks, splits them at the byte level,
 * parses each message, and writes metadata + search text to IndexedDB. The raw
 * file is copied into the origin-private file system (OPFS) in the same pass so
 * messages can be re-opened after a page reload.
 */
import { getDB } from '../db';
import type { MessageMeta, SearchChunk, Source } from '../types';
import { extractMessage } from './extract';
import { MboxSplitter, type RawMessage } from './splitter';

export type ImportRequest =
  | { type: 'import'; files: File[]; existingKeys: string[] }
  | { type: 'cancel' };

export type ImportEvent =
  | { type: 'source'; source: Source; file: File }
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
const READ_CHUNK = 8 * 1024 * 1024;

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
  close(): void;
}

async function openOpfsWriter(name: string, size: number): Promise<OpfsWriter | string> {
  try {
    if (!navigator.storage?.getDirectory) return 'This browser has no private file storage.';
    const est = await navigator.storage.estimate();
    const free = (est.quota ?? 0) - (est.usage ?? 0);
    if (free < size * 1.1) {
      return `Not enough browser storage to keep a copy (${Math.round(free / 1e6)} MB free).`;
    }
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(name, { create: true });
    const access = await (fh as FileSystemFileHandle & {
      createSyncAccessHandle(): Promise<{
        write(b: Uint8Array, o: { at: number }): number;
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
      close() {
        access.flush();
        access.close();
      },
    };
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/** Cheap sniff so a stray PDF or the Takeout .zip itself isn't imported as a "message". */
async function checkLooksLikeMail(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  if (head[0] === 0x50 && head[1] === 0x4b) {
    return `"${file.name}" is a zip archive. Unzip it first, then open the .mbox file inside (Takeout/Mail/…).`;
  }
  const text = new TextDecoder('latin1').decode(head).replace(/^\uFEFF|^\xEF\xBB\xBF/, '').replace(/^[\r\n]+/, '');
  if (text.startsWith('From ') || /^[!-9;-~]+:[^\r\n]*\r?\n/.test(text)) return null;
  return `"${file.name}" doesn't look like an mbox or .eml file, so it was skipped.`;
}

async function runImport(files: File[], existingKeys: Set<string>) {
  const db = await getDB();
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* best effort */
  }

  for (let fi = 0; fi < files.length && !cancelled; fi++) {
    const file = files[fi];
    const rejection = await checkLooksLikeMail(file);
    if (rejection) {
      post({ type: 'warning', message: rejection });
      continue;
    }
    const sourceId = shortId();
    const opfsName = `${sourceId}.mbox`;
    const writerOrReason = await openOpfsWriter(opfsName, file.size);
    const writer = typeof writerOrReason === 'string' ? null : writerOrReason;
    if (!writer) {
      post({
        type: 'warning',
        message: `"${file.name}" will be available until you close this tab, but won't be saved in the browser. ${writerOrReason}`,
      });
    }

    const source: Source = {
      id: sourceId,
      name: file.name,
      size: file.size,
      importedAt: Date.now(),
      messageCount: 0,
      duplicateCount: 0,
      persisted: !!writer,
      opfsName: writer ? opfsName : undefined,
      complete: false,
    };
    await db.put('sources', source);
    post({ type: 'source', source, file });

    const splitter = new MboxSplitter();
    let index = 0;
    let chunkNo = 0;
    let batch: MessageMeta[] = [];
    let texts: string[] = [];
    let bytesRead = 0;
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
      post({
        type: 'progress',
        fileName: file.name,
        fileIndex: fi,
        fileCount: files.length,
        bytesRead,
        totalBytes: file.size,
        messages: index,
        duplicates: source.duplicateCount,
      });
    };

    for (let pos = 0; pos < file.size && !cancelled; pos += READ_CHUNK) {
      const chunk = new Uint8Array(await file.slice(pos, pos + READ_CHUNK).arrayBuffer());
      writer?.write(chunk, pos);
      bytesRead = pos + chunk.length;
      for (const raw of splitter.push(chunk)) {
        await handle(raw);
        if (cancelled) break;
      }
      reportProgress();
    }
    if (!cancelled) for (const raw of splitter.end()) await handle(raw);
    await flush();
    writer?.close();

    source.messageCount = index;
    source.complete = !cancelled;
    await db.put('sources', source);
    post({ type: 'source', source, file });
    reportProgress(true);
  }

  post({ type: 'done', cancelled });
}
