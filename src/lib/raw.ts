import PostalMime from 'postal-mime';
import type { Email } from 'postal-mime';
import type { MessageMeta, Source } from './types';
import { toRfc822 } from './mbox/splitter';

/**
 * Files picked during this session. Used when the copy in browser storage is
 * still being written, or when the file couldn't be saved at all.
 */
const sessionFiles = new Map<string, File>();
const opfsFiles = new Map<string, File>();

export function registerSessionFile(sourceId: string, file: File) {
  sessionFiles.set(sourceId, file);
  opfsFiles.delete(sourceId);
}

export function forgetSource(sourceId: string) {
  sessionFiles.delete(sourceId);
  opfsFiles.delete(sourceId);
}

export function isSourceAvailable(source: Source): boolean {
  return sessionFiles.has(source.id) || source.persisted;
}

/** The whole source file as a lazily-read Blob. */
export async function sourceBlob(source: Source): Promise<Blob> {
  const session = sessionFiles.get(source.id);
  if (session) return session;
  if (source.persisted && source.opfsName) {
    let f = opfsFiles.get(source.id);
    if (!f) {
      const root = await navigator.storage.getDirectory();
      const fh = await root.getFileHandle(source.opfsName);
      f = await fh.getFile();
      opfsFiles.set(source.id, f);
    }
    return f;
  }
  throw new Error(`The file "${source.name}" isn't stored in this browser. Re-open it to read this message.`);
}

/** Message bytes exactly as stored in the mbox, including the separator line. */
export async function readMboxBytes(meta: MessageMeta, source: Source): Promise<Uint8Array> {
  const blob = await sourceBlob(source);
  return new Uint8Array(await blob.slice(meta.offset, meta.offset + meta.length).arrayBuffer());
}

/** The message as a standalone RFC 822 / .eml file. */
export async function readRfc822(meta: MessageMeta, source: Source): Promise<Uint8Array> {
  return toRfc822(await readMboxBytes(meta, source));
}

export interface ParsedMessage {
  email: Email;
  raw: Uint8Array;
}

const cache = new Map<string, Promise<ParsedMessage>>();
const CACHE_LIMIT = 60;

/** Fully parse a message (bodies + attachments). Results are cached LRU-style. */
export function parseFull(meta: MessageMeta, source: Source): Promise<ParsedMessage> {
  const hit = cache.get(meta.id);
  if (hit) {
    cache.delete(meta.id);
    cache.set(meta.id, hit);
    return hit;
  }
  const p = (async () => {
    const raw = await readRfc822(meta, source);
    const email = await PostalMime.parse(raw, { attachmentEncoding: 'arraybuffer', maxNestingDepth: 64 });
    return { email, raw };
  })();
  p.catch(() => cache.delete(meta.id));
  cache.set(meta.id, p);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return p;
}
