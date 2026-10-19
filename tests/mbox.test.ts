import { describe, expect, it } from 'vitest';
import PostalMime from 'postal-mime';
import { MboxSplitter, toRfc822, escapeForMbox, type RawMessage } from '../src/lib/mbox/splitter';
import { extractMessage } from '../src/lib/mbox/extract';
import { buildThreads } from '../src/lib/threads';
import { L, categoryLabel, splitLabelHeader } from '../src/lib/labels';
import type { MessageMeta } from '../src/lib/types';
import { buildSampleMbox, PDF_BYTES, sampleMessages } from './fixture';

function splitAll(data: Uint8Array, chunk: number): RawMessage[] {
  const s = new MboxSplitter();
  const out: RawMessage[] = [];
  for (let i = 0; i < data.length; i += chunk) out.push(...s.push(data.subarray(i, i + chunk)));
  out.push(...s.end());
  return out;
}

const mbox = buildSampleMbox(5);
const expected = sampleMessages(5).length;

async function extractAll(): Promise<MessageMeta[]> {
  const raws = splitAll(mbox, 1 << 20);
  const out: MessageMeta[] = [];
  for (let i = 0; i < raws.length; i++) {
    const { meta } = await extractMessage(raws[i].bytes);
    out.push({ ...meta, id: `s:${i}`, sourceId: 's', offset: raws[i].offset });
  }
  return out;
}

describe('MboxSplitter', () => {
  it('finds every message regardless of chunk size', () => {
    const reference = splitAll(mbox, 1 << 20);
    expect(reference).toHaveLength(expected);
    for (const size of [1, 3, 7, 64, 333, 4096]) {
      const got = splitAll(mbox, size);
      expect(got.map((m) => m.offset)).toEqual(reference.map((m) => m.offset));
      expect(got.map((m) => m.bytes.length)).toEqual(reference.map((m) => m.bytes.length));
    }
  });

  it('offsets point at the original bytes', () => {
    for (const m of splitAll(mbox, 1000)) {
      expect(mbox.subarray(m.offset, m.offset + m.bytes.length)).toEqual(m.bytes);
    }
  });

  it('does not split on escaped >From lines in bodies', () => {
    const subjects = splitAll(mbox, 50).map((m) => new TextDecoder().decode(m.bytes).match(/^Subject: (.*)$/m)?.[1]);
    expect(subjects).toContain('URGENT business proposal');
    expect(subjects.filter((s) => s === undefined)).toHaveLength(0);
  });

  it('treats a non-mbox file as a single .eml message', () => {
    const eml = new TextEncoder().encode('From: a@b.c\nSubject: hi\n\nbody\n');
    const got = splitAll(eml, 4);
    expect(got).toHaveLength(1);
    expect(got[0].offset).toBe(0);
  });

  it('round-trips >From quoting', () => {
    const raw = new TextEncoder().encode('From x@y Mon Jan  1 00:00:00 2024\nSubject: t\n\n>From one\n>>From two\nFrom three\n\n');
    const rfc = new TextDecoder().decode(toRfc822(raw));
    expect(rfc).toBe('Subject: t\n\nFrom one\n>From two\nFrom three\n');
    const re = new TextDecoder().decode(escapeForMbox(new TextEncoder().encode(rfc)));
    expect(re).toBe('Subject: t\n\n>From one\n>>From two\n>From three\n');
  });
});

describe('extractMessage', async () => {
  const metas = await extractAll();
  const bySubject = (s: string) => metas.find((m) => m.subject === s)!;

  it('decodes windows-1252 smart quotes without mojibake', () => {
    const m = bySubject('Q3 budget review');
    expect(m.snippet).toContain('Here’s the “final” budget – please review by Friday…');
    expect(m.snippet).not.toMatch(/â|Â|€/);
  });

  it('decodes encoded-word headers and base64 UTF-8 HTML', () => {
    const m = metas.find((x) => x.messageId === 'promo-1@shop.example')!;
    expect(m.subject).toBe('🎉 Spring sale — 40% off');
    expect(m.from.name).toBe('Shöp Délice');
    expect(m.snippet).toContain('Spring sale 🌷');
  });

  it('decodes iso-8859-1 and 8bit utf-8 bodies', () => {
    expect(metas.find((x) => x.messageId === 'outlook-1@corp.example')!.snippet).toContain('Señor Ruiz');
    expect(bySubject('Old thing').snippet).toContain('Café crème — naïve résumé.');
  });

  it('maps Gmail labels to folders, flags and categories', () => {
    const first = bySubject('Q3 budget review');
    expect(first.labels).toEqual(expect.arrayContaining([L.inbox, 'Work/Clients']));
    expect(first.important).toBe(true);
    expect(first.unread).toBe(false);
    const unread = metas.find((x) => x.messageId === 'thread1-c@example.com')!;
    expect(unread.unread).toBe(true);
    expect(unread.starred).toBe(true);
    expect(unread.labels).not.toContain(L.unread);
    expect(metas.find((x) => x.messageId === 'promo-1@shop.example')!.labels).toContain(categoryLabel('promotions'));
    expect(metas.find((x) => x.messageId === 'outlook-1@corp.example')!.labels).toContain('Projects, 2024');
    expect(bySubject('URGENT business proposal').labels).toContain(L.spam);
    expect(bySubject('Offsite ideas').labels).toContain(L.drafts);
  });

  it('lists real attachments but not inline cid images', () => {
    const m = metas.find((x) => x.messageId === 'thread1-c@example.com')!;
    expect(m.attachments).toEqual([{ name: 'budget-final.pdf', type: 'application/pdf', size: PDF_BYTES.length }]);
  });

  it('strips quoted history from snippets', () => {
    expect(metas.find((x) => x.messageId === 'thread1-b@example.com')!.snippet).toBe('Looks good to me.');
  });

  it('keeps binary attachments byte-for-byte intact', async () => {
    const raw = splitAll(mbox, 1 << 20).find((r) => new TextDecoder().decode(r.bytes).includes('thread1-c@example.com'))!;
    const email = await PostalMime.parse(toRfc822(raw.bytes));
    const pdf = email.attachments.find((a) => a.filename === 'budget-final.pdf')!;
    expect(new Uint8Array(pdf.content as ArrayBuffer)).toEqual(PDF_BYTES);
  });

  it('builds conversations from Gmail thread ids', () => {
    const threads = buildThreads(metas);
    const t = threads.get('g1790000000000000001')!;
    expect(t.messageIds).toHaveLength(3);
    expect(t.subject).toBe('Q3 budget review');
    expect(t.unread).toBe(true);
    expect(t.starred).toBe(true);
    expect(t.hasAttachments).toBe(true);
    expect(threads.get('g1790000000000000004')!.junk).toBe(true);
  });
});

describe('threading without Gmail ids', () => {
  const base = {
    sourceId: 's', offset: 0, headerOffset: 0, length: 1, dedupeKey: '', references: [] as string[],
    to: [], cc: [], bcc: [], replyTo: [], snippet: '', labels: [], attachments: [],
    unread: false, starred: false, important: false, from: { name: '', address: 'a@x' },
  };
  it('links replies through References/In-Reply-To and keeps same-subject strangers apart', () => {
    const msgs: MessageMeta[] = [
      { ...base, id: 's:0', messageId: 'a@x', subject: 'Meeting', date: 1 },
      { ...base, id: 's:1', messageId: 'b@x', subject: 'Re: Meeting', date: 2, inReplyTo: 'a@x' },
      { ...base, id: 's:2', messageId: 'c@x', subject: 'Re: Meeting', date: 3, references: ['a@x', 'b@x'] },
      { ...base, id: 's:3', messageId: 'd@x', subject: 'Meeting', date: 4 },
    ];
    const threads = [...buildThreads(msgs).values()];
    expect(threads.map((t) => t.messageIds.length).sort()).toEqual([1, 3]);
  });
});

describe('splitLabelHeader', () => {
  it('handles quoted labels with commas', () => {
    expect(splitLabelHeader('Inbox,"Projects, 2024",Work/Clients')).toEqual(['Inbox', 'Projects, 2024', 'Work/Clients']);
  });
});
