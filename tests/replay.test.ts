import { describe, expect, it } from 'vitest';
import { buildReplay, gapLabel, isLongGap, spanLabel } from '../src/lib/replay';
import type { Addr, MessageMeta } from '../src/lib/types';

const a = (name: string): Addr => ({ name, address: `${name.toLowerCase()}@example.com` });
const SAM = a('Sam');
const DANA = a('Dana');
const LEE = a('Lee');
const PAT = a('Pat');

const HOUR = 3_600_000;
const T0 = new Date(2026, 9, 12, 9, 14).getTime();

let n = 0;
function msg(p: Partial<MessageMeta> & { from: Addr }): MessageMeta {
  const i = n++;
  return {
    id: `s:${i}`,
    sourceId: 's',
    offset: i * 100,
    headerOffset: 0,
    length: 100,
    messageId: `m${i}@x`,
    dedupeKey: `m${i}`,
    references: [],
    to: [],
    cc: [],
    bcc: [],
    replyTo: [],
    subject: 'Contract',
    date: T0,
    snippet: '',
    labels: [],
    attachments: [],
    unread: false,
    starred: false,
    important: false,
    ...p,
  };
}

describe('buildReplay', () => {
  const first = msg({ from: SAM, to: [DANA, LEE], date: T0, attachments: [{ name: 'contract.pdf', type: 'application/pdf', size: 1200 }] });
  const second = msg({ from: LEE, to: [SAM, DANA], date: T0 + 2 * HOUR, inReplyTo: first.messageId, references: [first.messageId] });
  // Dana answers Sam's original (not Lee), adds Pat, and re-sends the same PDF plus a new file.
  const third = msg({
    from: DANA,
    to: [SAM, LEE],
    cc: [PAT],
    date: T0 + 54 * HOUR,
    inReplyTo: first.messageId,
    references: [first.messageId],
    attachments: [
      { name: 'contract.pdf', type: 'application/pdf', size: 1200 },
      { name: 'form.pdf', type: 'application/pdf', size: 900 },
    ],
  });
  const replay = buildReplay([first, second, third]);
  const [e1, e2, e3] = replay.entries;

  it('marks day boundaries and gaps', () => {
    expect([e1.newDay, e2.newDay, e3.newDay]).toEqual([true, false, true]);
    expect(e1.gapMs).toBeNull();
    expect(e2.gapMs).toBe(2 * HOUR);
    expect(e3.gapMs).toBe(52 * HOUR);
  });

  it('only calls out a reply target when it is not the previous message', () => {
    expect(e2.replyToIndex).toBeNull();
    expect(e3.replyToIndex).toBe(0);
  });

  it('diffs recipients against the message being answered', () => {
    expect(e1.added).toEqual([]);
    expect(e2.added).toEqual([]);
    expect(e2.removed).toEqual([]);
    expect(e3.added).toEqual([PAT]);
    expect(e3.removed).toEqual([]);
  });

  it('flags only the first appearance of each attachment', () => {
    expect(e1.attachments.map((x) => x.first)).toEqual([true]);
    expect(e3.attachments.map((x) => [x.name, x.first])).toEqual([
      ['contract.pdf', false],
      ['form.pdf', true],
    ]);
  });

  it('lists senders first, then people who only received', () => {
    expect(replay.participants.map((p) => [p.addr.name, p.sent])).toEqual([
      ['Sam', 1],
      ['Lee', 1],
      ['Dana', 1],
      ['Pat', 0],
    ]);
    expect(replay.start).toBe(T0);
    expect(replay.end).toBe(T0 + 54 * HOUR);
  });

  it('falls back to the previous message when the parent is missing, and notices dropped people', () => {
    const lone = msg({ from: SAM, to: [DANA, LEE], date: T0 });
    const narrowed = msg({ from: DANA, to: [SAM], date: T0 + HOUR, inReplyTo: 'not-in-archive@x' });
    const r = buildReplay([lone, narrowed]);
    expect(r.entries[1].replyToIndex).toBeNull();
    expect(r.entries[1].removed).toEqual([LEE]);
  });

  it('copes with unknown dates', () => {
    const r = buildReplay([msg({ from: SAM, date: 0 }), msg({ from: DANA, date: T0 })]);
    expect(r.entries[0].day).toBe('');
    expect(r.entries[1].gapMs).toBeNull();
    expect(r.entries[1].newDay).toBe(true);
    expect(r.start).toBe(T0);
  });
});

describe('labels', () => {
  it('describes gaps', () => {
    expect(gapLabel(null)).toBeNull();
    expect(gapLabel(30 * 60_000)).toBeNull();
    expect(gapLabel(HOUR)).toBe('1 hour later');
    expect(gapLabel(52 * HOUR)).toBe('2 days later');
    expect(gapLabel(21 * 24 * HOUR)).toBe('3 weeks later');
    expect(gapLabel(400 * 24 * HOUR)).toBe('1 year later');
    expect(isLongGap(23 * HOUR)).toBe(false);
    expect(isLongGap(24 * HOUR)).toBe(true);
  });

  it('describes the span', () => {
    expect(spanLabel(0, T0)).toBeNull();
    expect(spanLabel(T0, T0 + 54 * HOUR)).toBe('2 days');
    expect(spanLabel(T0, T0 + 5 * 60_000)).toBe('5 minutes');
  });
});
