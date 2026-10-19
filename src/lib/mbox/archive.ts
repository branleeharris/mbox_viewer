/**
 * Find mbox files inside whatever the user opened: a plain .mbox/.eml, a .zip
 * (Google Takeout's default, Zip64 included), a .tgz/.tar.gz, a .tar, or a
 * gzipped mbox. Everything streams: archives are never loaded into memory, and
 * zip entries are located from the central directory without reading the rest.
 */

export interface Progress {
  /** Input bytes consumed so far (compressed bytes for archives). */
  read: number;
}

export interface MailStream {
  /** Display name, e.g. "All mail Including Spam and Trash.mbox". */
  name: string;
  /** Archive file this came from, if any. */
  archive?: string;
  /** Path inside the archive, if any. */
  path?: string;
  /** Uncompressed size when known up front, else 0. */
  sizeHint: number;
  chunks: AsyncIterable<Uint8Array>;
  /** The original File, when the mbox is the opened file itself (no extraction). */
  file?: File;
}

export type Plan =
  | { kind: 'mbox'; file: File; total: number }
  | { kind: 'zip'; file: File; total: number; entries: ZipEntry[] }
  | { kind: 'gzip' | 'tar'; file: File; total: number };

export interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  compSize: number;
  size: number;
  localOffset: number;
}

const READ_CHUNK = 8 * 1024 * 1024;
const MAIL_PATH = /\.(mbox|mbx)$/i;
const utf8 = new TextDecoder('utf-8');
const latin1 = new TextDecoder('latin1');

const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1);

// ---------------------------------------------------------------- planning

/** Decide how to read a file. Returns a plan, or a user-facing reason it can't be imported. */
export async function planFile(file: File): Promise<Plan | string> {
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  if (head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05)) {
    let entries: ZipEntry[];
    try {
      entries = await listZip(file);
    } catch (err) {
      return `"${file.name}" couldn't be read as a zip archive (${err instanceof Error ? err.message : err}).`;
    }
    const mail = entries.filter((e) => MAIL_PATH.test(e.name) && !e.name.endsWith('/'));
    if (!mail.length) {
      return `"${file.name}" has no .mbox files inside. In a Google Takeout export, mail is in the archive that contains Takeout/Mail/.`;
    }
    const usable = mail.filter((e) => !(e.flags & 1) && (e.method === 0 || e.method === 8));
    if (!usable.length) {
      return `The .mbox files in "${file.name}" are encrypted or use an unsupported compression method. Unzip it with your computer's archive tool instead.`;
    }
    return { kind: 'zip', file, entries: usable, total: usable.reduce((n, e) => n + e.compSize, 0) };
  }
  if (head[0] === 0x1f && head[1] === 0x8b) return { kind: 'gzip', file, total: file.size };
  if (latin1.decode(head.subarray(257, 262)) === 'ustar') return { kind: 'tar', file, total: file.size };

  const text = latin1.decode(head).replace(/^\xEF\xBB\xBF/, '').replace(/^[\r\n]+/, '');
  if (text.startsWith('From ') || /^[!-9;-~]+:[^\r\n]*\r?\n/.test(text)) return { kind: 'mbox', file, total: file.size };
  return `"${file.name}" doesn't look like an mbox, .eml or Takeout archive, so it was skipped.`;
}

/** Every mbox stream in a planned file, in order. */
export async function* openPlan(plan: Plan, progress: Progress, warn: (msg: string) => void): AsyncGenerator<MailStream> {
  const { file } = plan;
  switch (plan.kind) {
    case 'mbox':
      yield { name: file.name, sizeHint: file.size, chunks: blobChunks(file, progress), file };
      return;
    case 'zip':
      for (const e of plan.entries) {
        yield {
          name: basename(e.name),
          archive: file.name,
          path: e.name,
          sizeHint: e.size,
          chunks: rechunk(await openZipEntry(file, e, progress)),
        };
      }
      return;
    case 'tar':
      yield* tarMail(new ByteReader(blobChunks(file, progress)), file.name, warn);
      return;
    case 'gzip': {
      const inflated = streamIter(
        counted(file.stream(), progress).pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>),
      );
      const reader = new ByteReader(inflated);
      await reader.fill(512);
      if (reader.peekString(257, 5) === 'ustar') {
        yield* tarMail(reader, file.name, warn);
      } else {
        // A single gzipped mbox (e.g. "Inbox.mbox.gz").
        yield { name: file.name.replace(/\.gz$/i, ''), archive: file.name, sizeHint: 0, chunks: rechunk(reader.rest()) };
      }
      return;
    }
  }
}

async function* tarMail(reader: ByteReader, archive: string, warn: (msg: string) => void): AsyncGenerator<MailStream> {
  let found = 0;
  for await (const entry of tarEntries(reader)) {
    if (!entry.isFile || !MAIL_PATH.test(entry.path)) continue;
    found++;
    yield { name: basename(entry.path), archive, path: entry.path, sizeHint: entry.size, chunks: rechunk(entry.body) };
  }
  if (!found) warn(`"${archive}" has no .mbox files inside. In a Google Takeout export, mail is in the archive that contains Takeout/Mail/.`);
}

// ---------------------------------------------------------------- streams

async function* blobChunks(blob: Blob, progress: Progress): AsyncGenerator<Uint8Array> {
  for (let pos = 0; pos < blob.size; pos += READ_CHUNK) {
    const chunk = new Uint8Array(await blob.slice(pos, pos + READ_CHUNK).arrayBuffer());
    progress.read += chunk.length;
    yield chunk;
  }
}

function counted(stream: ReadableStream<Uint8Array>, progress: Progress): ReadableStream<Uint8Array> {
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        progress.read += chunk.length;
        ctrl.enqueue(chunk);
      },
    }),
  );
}

export async function* streamIter(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value?.length) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Decompressors emit small chunks; the mbox splitter copies its carry-over on
 * every push, so batch into large chunks to keep big messages linear-time.
 */
export async function* rechunk(src: AsyncIterable<Uint8Array>, size = READ_CHUNK): AsyncGenerator<Uint8Array> {
  let parts: Uint8Array[] = [];
  let len = 0;
  for await (const c of src) {
    parts.push(c);
    len += c.length;
    if (len >= size) {
      yield join(parts, len);
      parts = [];
      len = 0;
    }
  }
  if (len) yield join(parts, len);
}

function join(parts: Uint8Array[], len: number): Uint8Array {
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Pull-based byte reader over an async chunk source. */
export class ByteReader {
  private it: AsyncIterator<Uint8Array>;
  private buf: Uint8Array = new Uint8Array(0);
  private pos = 0;
  private eof = false;

  constructor(src: AsyncIterable<Uint8Array>) {
    this.it = src[Symbol.asyncIterator]();
  }

  private get avail() {
    return this.buf.length - this.pos;
  }

  /** Buffer at least n bytes; false if the source ended first. */
  async fill(n: number): Promise<boolean> {
    while (this.avail < n && !this.eof) {
      const { done, value } = await this.it.next();
      if (done) {
        this.eof = true;
        break;
      }
      const rest = this.buf.subarray(this.pos);
      const next = new Uint8Array(rest.length + value.length);
      next.set(rest);
      next.set(value, rest.length);
      this.buf = next;
      this.pos = 0;
    }
    return this.avail >= n;
  }

  peekString(offset: number, len: number): string {
    return latin1.decode(this.buf.subarray(this.pos + offset, this.pos + offset + len));
  }

  /** Exactly n bytes, or null at a clean end of input. */
  async read(n: number): Promise<Uint8Array | null> {
    if (!(await this.fill(n))) {
      if (this.avail === 0) return null;
      throw new Error('archive is truncated');
    }
    const out = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  /** Yield the next n bytes in pieces without buffering them all. */
  async *take(n: number): AsyncGenerator<Uint8Array> {
    let remaining = n;
    while (remaining > 0) {
      if (this.avail === 0) {
        const { done, value } = await this.it.next();
        if (done) throw new Error('archive is truncated');
        this.buf = value;
        this.pos = 0;
        continue;
      }
      const give = Math.min(remaining, this.avail);
      const piece = this.buf.subarray(this.pos, this.pos + give);
      this.pos += give;
      remaining -= give;
      yield piece;
    }
  }

  async skip(n: number): Promise<void> {
    for await (const piece of this.take(n)) void piece;
  }

  async *rest(): AsyncGenerator<Uint8Array> {
    if (this.avail) yield this.buf.subarray(this.pos);
    this.buf = new Uint8Array(0);
    this.pos = 0;
    while (true) {
      const { done, value } = await this.it.next();
      if (done) return;
      yield value;
    }
  }
}

// ---------------------------------------------------------------- zip

async function bytesAt(file: Blob, start: number, len: number): Promise<DataView> {
  const buf = await file.slice(start, start + len).arrayBuffer();
  if (buf.byteLength < len) throw new Error('unexpected end of file');
  return new DataView(buf);
}

const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true));

/** Read the central directory (handles Zip64). */
export async function listZip(file: Blob): Promise<ZipEntry[]> {
  const tailLen = Math.min(file.size, 65_557);
  const tailStart = file.size - tailLen;
  const tail = await bytesAt(file, tailStart, tailLen);
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('no end-of-central-directory record');

  let count = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOffset = tail.getUint32(eocd + 16, true);

  const locAt = eocd - 20;
  if (locAt >= 0 && tail.getUint32(locAt, true) === 0x07064b50) {
    const z64Offset = u64(tail, locAt + 8);
    const z = await bytesAt(file, z64Offset, 56);
    if (z.getUint32(0, true) !== 0x06064b50) throw new Error('bad Zip64 end record');
    count = u64(z, 32);
    cdSize = u64(z, 40);
    cdOffset = u64(z, 48);
  }

  const cd = await bytesAt(file, cdOffset, cdSize);
  const raw = new Uint8Array(cd.buffer);
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cdSize; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) throw new Error('bad central directory entry');
    const flags = cd.getUint16(p + 8, true);
    const method = cd.getUint16(p + 10, true);
    let compSize = cd.getUint32(p + 20, true);
    let size = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    let localOffset = cd.getUint32(p + 42, true);
    const nameBytes = raw.subarray(p + 46, p + 46 + nameLen);
    // Names are UTF-8 when flag bit 11 is set; legacy CP437 names are near-ASCII in practice.
    const name = utf8.decode(nameBytes);

    // Zip64 extended information: only the maxed-out fields are present, in this order.
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = cd.getUint16(e, true);
      const len = cd.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) (size = u64(cd, q)), (q += 8);
        if (compSize === 0xffffffff) (compSize = u64(cd, q)), (q += 8);
        if (localOffset === 0xffffffff) localOffset = u64(cd, q);
      }
      e += 4 + len;
    }
    entries.push({ name, method, flags, compSize, size, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function openZipEntry(file: Blob, entry: ZipEntry, progress: Progress): Promise<AsyncIterable<Uint8Array>> {
  const local = await bytesAt(file, entry.localOffset, 30);
  if (local.getUint32(0, true) !== 0x04034b50) throw new Error(`bad local header for ${entry.name}`);
  const start = entry.localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
  let stream = counted(file.slice(start, start + entry.compSize).stream() as ReadableStream<Uint8Array>, progress);
  if (entry.method === 8) {
    stream = stream.pipeThrough(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  }
  return streamIter(stream);
}

// ---------------------------------------------------------------- tar

interface TarEntry {
  path: string;
  size: number;
  isFile: boolean;
  body: AsyncIterable<Uint8Array>;
}

function cstr(b: Uint8Array, off: number, len: number): string {
  const s = b.subarray(off, off + len);
  const nul = s.indexOf(0);
  return utf8.decode(nul >= 0 ? s.subarray(0, nul) : s);
}

function tarSize(field: Uint8Array): number {
  if (field[0] & 0x80) {
    // GNU base-256 for files over 8 GB.
    let v = field[0] & 0x7f;
    for (let i = 1; i < field.length; i++) v = v * 256 + field[i];
    return v;
  }
  const s = cstr(field, 0, field.length).trim();
  return s ? parseInt(s, 8) : 0;
}

const pad512 = (n: number) => (512 - (n % 512)) % 512;

async function collect(src: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let len = 0;
  for await (const c of src) {
    parts.push(c.slice());
    len += c.length;
  }
  return join(parts, len);
}

export async function* tarEntries(r: ByteReader): AsyncGenerator<TarEntry> {
  let longName: string | null = null;
  let pax: Record<string, string> = {};
  while (true) {
    const h = await r.read(512);
    if (!h || h.every((b) => b === 0)) return;
    const typeByte = h[156];
    const type = typeByte ? String.fromCharCode(typeByte) : '0';
    let name = cstr(h, 0, 100);
    if (cstr(h, 257, 5) === 'ustar') {
      const prefix = cstr(h, 345, 155);
      if (prefix) name = `${prefix}/${name}`;
    }
    let size = tarSize(h.subarray(124, 136));

    if (type === 'L' || type === 'x' || type === 'g') {
      const data = await collect(r.take(size));
      await r.skip(pad512(size));
      if (type === 'L') longName = cstr(data, 0, data.length);
      else if (type === 'x') pax = parsePax(data);
      continue;
    }

    if (pax.size) size = Number(pax.size);
    const path = pax.path ?? longName ?? name;
    longName = null;
    pax = {};

    let consumed = 0;
    const body = (async function* () {
      for await (const c of r.take(size)) {
        consumed += c.length;
        yield c;
      }
    })();
    yield { path, size, isFile: type === '0' || type === '7', body };
    // Skip whatever the consumer didn't read, then the block padding.
    if (consumed < size) await r.skip(size - consumed);
    await r.skip(pad512(size));
  }
}

/** PAX records are "<len> key=value\n" where len counts bytes (not characters). */
function parsePax(data: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < data.length) {
    const sp = data.indexOf(0x20, i);
    if (sp < 0) break;
    const len = parseInt(latin1.decode(data.subarray(i, sp)), 10);
    if (!len || i + len > data.length) break;
    const record = utf8.decode(data.subarray(sp + 1, i + len - 1));
    const eq = record.indexOf('=');
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1);
    i += len;
  }
  return out;
}
