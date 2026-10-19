import { describe, expect, it } from 'vitest';
import { planFile, openPlan, listZip, type Plan } from '../src/lib/mbox/archive';
import { MboxSplitter } from '../src/lib/mbox/splitter';
import { effectiveLabels, L } from '../src/lib/labels';
import { buildSampleMbox } from './fixture';

const enc = new TextEncoder();

/** Compress with the same standard API the app uses to decompress. */
async function compress(data: Uint8Array, format: 'deflate-raw' | 'gzip'): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream(format) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const deflateRawSync = (d: Uint8Array) => compress(d, 'deflate-raw');
const gzipSync = (d: Uint8Array) => compress(d, 'gzip');
const mbox = buildSampleMbox(40);

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

interface ZipFileSpec {
  name: string;
  data: Uint8Array;
  method?: 0 | 8;
}

/** Minimal zip writer. `zip64` forces Zip64 extra fields and end records, like archives over 4 GB. */
async function makeZip(files: ZipFileSpec[], zip64 = false): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const method = f.method ?? 8;
    const body = method === 8 ? await deflateRawSync(f.data) : f.data;
    const name = enc.encode(f.name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x800, true);
    local.setUint16(8, method, true);
    local.setUint32(18, zip64 ? 0xffffffff : body.length, true);
    local.setUint32(22, zip64 ? 0xffffffff : f.data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, body);

    const extra = new DataView(new ArrayBuffer(zip64 ? 28 : 0));
    if (zip64) {
      extra.setUint16(0, 0x0001, true);
      extra.setUint16(2, 24, true);
      extra.setBigUint64(4, BigInt(f.data.length), true);
      extra.setBigUint64(12, BigInt(body.length), true);
      extra.setBigUint64(20, BigInt(offset), true);
    }
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 45, true);
    cd.setUint16(6, 45, true);
    cd.setUint16(8, 0x800, true);
    cd.setUint16(10, method, true);
    cd.setUint32(20, zip64 ? 0xffffffff : body.length, true);
    cd.setUint32(24, zip64 ? 0xffffffff : f.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint16(30, extra.byteLength, true);
    cd.setUint32(42, zip64 ? 0xffffffff : offset, true);
    central.push(new Uint8Array(cd.buffer), name, new Uint8Array(extra.buffer));
    offset += 30 + name.length + body.length;
  }
  const cdBytes = concat(central);
  const tail: Uint8Array[] = [];
  if (zip64) {
    const z = new DataView(new ArrayBuffer(56));
    z.setUint32(0, 0x06064b50, true);
    z.setBigUint64(4, 44n, true);
    z.setBigUint64(24, BigInt(files.length), true);
    z.setBigUint64(32, BigInt(files.length), true);
    z.setBigUint64(40, BigInt(cdBytes.length), true);
    z.setBigUint64(48, BigInt(offset), true);
    const loc = new DataView(new ArrayBuffer(20));
    loc.setUint32(0, 0x07064b50, true);
    loc.setBigUint64(8, BigInt(offset + cdBytes.length), true);
    loc.setUint32(16, 1, true);
    tail.push(new Uint8Array(z.buffer), new Uint8Array(loc.buffer));
  }
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, zip64 ? 0xffff : files.length, true);
  eocd.setUint16(10, zip64 ? 0xffff : files.length, true);
  eocd.setUint32(12, zip64 ? 0xffffffff : cdBytes.length, true);
  eocd.setUint32(16, zip64 ? 0xffffffff : offset, true);
  return concat([...parts, cdBytes, ...tail, new Uint8Array(eocd.buffer)]);
}

function tarHeader(name: string, size: number, type = '0'): Uint8Array {
  const h = new Uint8Array(512);
  h.set(enc.encode(name.slice(0, 99)), 0);
  h.set(enc.encode('0000644\0'), 100);
  h.set(enc.encode(size.toString(8).padStart(11, '0') + '\0'), 124);
  h[156] = type.charCodeAt(0);
  h.set(enc.encode('ustar\0'), 257);
  h.set(enc.encode('00'), 263);
  h.fill(0x20, 148, 156);
  let sum = 0;
  for (const b of h) sum += b;
  h.set(enc.encode(sum.toString(8).padStart(6, '0') + '\0 '), 148);
  return h;
}

const pad = (n: number) => new Uint8Array((512 - (n % 512)) % 512);

function tarEntry(name: string, data: Uint8Array, type = '0'): Uint8Array {
  return concat([tarHeader(name, data.length, type), data, pad(data.length)]);
}

function paxRecord(key: string, value: string): Uint8Array {
  const body = ` ${key}=${value}\n`;
  let len = enc.encode(body).length;
  len += String(len + String(len).length).length;
  return enc.encode(`${len}${body}`);
}

function makeTar(entries: Uint8Array[]): Uint8Array {
  return concat([...entries, new Uint8Array(1024)]);
}

async function extractAll(bytes: Uint8Array, name: string) {
  const plan = await planFile(new File([bytes as BlobPart], name));
  if (typeof plan === 'string') throw new Error(plan);
  const warnings: string[] = [];
  const out: { name: string; path?: string; archive?: string; data: Uint8Array }[] = [];
  const progress = { read: 0 };
  for await (const s of openPlan(plan as Plan, progress, (w) => warnings.push(w))) {
    const parts: Uint8Array[] = [];
    for await (const c of s.chunks) parts.push(c.slice());
    out.push({ name: s.name, path: s.path, archive: s.archive, data: concat(parts) });
  }
  return { plan: plan as Plan, out, warnings, progress };
}

function countMessages(data: Uint8Array): number {
  const s = new MboxSplitter();
  return s.push(data).length + s.end().length;
}

describe('zip archives', () => {
  it('extracts deflated and stored mbox entries byte-for-byte, skipping other files', async () => {
    const zip = await makeZip([
      { name: 'Takeout/archive_browser.html', data: enc.encode('<html></html>') },
      { name: 'Takeout/Mail/All mail Including Spam and Trash.mbox', data: mbox },
      { name: 'Takeout/Mail/Sent.mbox', data: mbox.subarray(0, 2000), method: 0 },
    ]);
    const { plan, out, progress } = await extractAll(zip, 'takeout-001.zip');
    expect(plan.kind).toBe('zip');
    expect(out.map((o) => o.name)).toEqual(['All mail Including Spam and Trash.mbox', 'Sent.mbox']);
    expect(out[0].data).toEqual(mbox);
    expect(out[0].archive).toBe('takeout-001.zip');
    expect(out[1].data).toEqual(mbox.subarray(0, 2000));
    expect(countMessages(out[0].data)).toBe(countMessages(mbox));
    expect(progress.read).toBe(plan.total);
  });

  it('reads Zip64 sizes and offsets', async () => {
    const zip = await makeZip([{ name: 'a.mbox', data: mbox }, { name: 'b.mbox', data: mbox, method: 0 }], true);
    const entries = await listZip(new Blob([zip as BlobPart]));
    expect(entries.map((e) => [e.name, e.size])).toEqual([
      ['a.mbox', mbox.length],
      ['b.mbox', mbox.length],
    ]);
    const { out } = await extractAll(zip, 'big.zip');
    expect(out[0].data).toEqual(mbox);
    expect(out[1].data).toEqual(mbox);
  });

  it('explains a zip with no mail in it', async () => {
    const plan = await planFile(new File([(await makeZip([{ name: 'photo.jpg', data: new Uint8Array(10) }])) as BlobPart], 'Drive.zip'));
    expect(plan).toMatch(/no \.mbox files/);
  });
});

describe('tar archives', () => {
  const longPath = 'Takeout/Mail/' + 'Very long label name '.repeat(8).trim() + '.mbox';

  it('reads .tgz with GNU long names and PAX paths', async () => {
    const tar = makeTar([
      tarEntry('Takeout/', new Uint8Array(0), '5'),
      tarEntry('././@LongLink', enc.encode(longPath + '\0'), 'L'),
      tarEntry('Takeout/Mail/truncated', mbox),
      tarEntry('PaxHeaders/x', paxRecord('path', 'Takeout/Mail/Étiquette.mbox'), 'x'),
      tarEntry('Takeout/Mail/short', mbox.subarray(0, 3000)),
      tarEntry('Takeout/notes.txt', enc.encode('hello')),
    ]);
    const { plan, out } = await extractAll(await gzipSync(tar), 'takeout.tgz');
    expect(plan.kind).toBe('gzip');
    expect(out.map((o) => o.path)).toEqual([longPath, 'Takeout/Mail/Étiquette.mbox']);
    expect(out[0].data).toEqual(mbox);
    expect(out[1].data).toEqual(mbox.subarray(0, 3000));
  });

  it('reads an uncompressed .tar', async () => {
    const { plan, out } = await extractAll(makeTar([tarEntry('Mail/Inbox.mbox', mbox)]), 'mail.tar');
    expect(plan.kind).toBe('tar');
    expect(out[0].data).toEqual(mbox);
  });

  it('reads a gzipped mbox that is not a tarball', async () => {
    const { out } = await extractAll(await gzipSync(mbox), 'Inbox.mbox.gz');
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Inbox.mbox');
    expect(out[0].data).toEqual(mbox);
  });
});

describe('plain files', () => {
  it('passes .mbox through with the original File', async () => {
    const { plan, out } = await extractAll(mbox, 'mail.mbox');
    expect(plan.kind).toBe('mbox');
    expect(out[0].data).toEqual(mbox);
  });
  it('rejects files that are not mail', async () => {
    expect(await planFile(new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 1, 2])], 'x.pdf'))).toMatch(/doesn't look like/);
  });
});

describe('effectiveLabels (exports without folders, e.g. Google Vault)', () => {
  const me = ['owner@school.example'];
  const base = { gmThreadId: undefined, folderless: true, labels: [L.inbox] };
  it('files mail from the owner under Sent and the rest under Inbox', () => {
    expect(effectiveLabels({ ...base, from: { name: '', address: 'owner@school.example' } }, me)).toEqual([L.sent]);
    expect(effectiveLabels({ ...base, from: { name: '', address: 'teacher@school.example' } }, me)).toEqual([L.inbox]);
  });
  it('recognizes label-less messages imported before the folderless flag existed', () => {
    expect(effectiveLabels({ labels: [L.inbox], from: { name: '', address: 'owner@school.example' } }, me)).toEqual([L.sent]);
  });
  it('leaves Gmail-labelled mail alone', () => {
    const gm = { labels: [L.inbox], gmThreadId: '123', from: { name: '', address: 'owner@school.example' } };
    expect(effectiveLabels(gm, me)).toEqual([L.inbox]);
  });
});
