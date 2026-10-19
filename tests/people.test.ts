import { describe, expect, it } from 'vitest';
import { between, correspondents, directory } from '../src/lib/people';
import { buildReplay } from '../src/lib/replay';
import { L } from '../src/lib/labels';
import type { Addr, MessageMeta } from '../src/lib/types';

const a = (name: string, address = `${name.toLowerCase()}@example.com`): Addr => ({ name, address });
const SAM = a('Sam');
const DANA = a('Dana');
const LEE = a('Lee');
const PAT = a('Pat');

const DAY = 86_400_000;
const T0 = new Date(2026, 0, 5, 9).getTime();

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
    subject: 'Subject',
    date: T0 + i * DAY,
    snippet: '',
    labels: [],
    attachments: [],
    unread: false,
    starred: false,
    important: false,
    ...p,
  };
}

const budget1 = msg({ from: SAM, to: [DANA], subject: 'Budget' });
const budget2 = msg({ from: DANA, to: [SAM, LEE], subject: 'Re: Budget', inReplyTo: budget1.messageId });
const offsite = msg({ from: { name: 'D. Ruiz', address: 'DANA@example.com' }, to: [PAT], cc: [SAM], subject: 'Offsite' });
const newsletter = msg({ from: LEE, to: [SAM], bcc: [DANA], subject: 'Newsletter' });
const unrelated = msg({ from: PAT, to: [LEE], subject: 'Lunch' });
const spam = msg({ from: SAM, to: [DANA], labels: [L.spam] });
const draft = msg({ from: DANA, to: [SAM], labels: [L.drafts] });
// Out of date order on purpose: results must come back sorted.
const all = [budget2, unrelated, budget1, offsite, newsletter, spam, draft];

describe('directory', () => {
  it('lists every address once, busiest first, with the most common name', () => {
    const people = directory(all);
    expect(people.map((p) => p.key)).toEqual(['dana@example.com', 'sam@example.com', 'lee@example.com', 'pat@example.com']);
    const dana = people[0];
    expect(dana.addr).toEqual({ name: 'Dana', address: 'dana@example.com' });
    expect([dana.sent, dana.received]).toEqual([2, 2]);
  });

  it('ignores spam and drafts', () => {
    expect(directory([spam, draft])).toEqual([]);
  });
});

describe('correspondents', () => {
  it('counts who a person exchanged mail with, in either direction', () => {
    const c = correspondents(all, 'sam@example.com');
    expect(Object.fromEntries(c)).toEqual({ 'dana@example.com': 3, 'lee@example.com': 1 });
  });
});

describe('between', () => {
  it('finds mail either one sent the other, oldest first, across threads', () => {
    const r = between(all, 'sam@example.com', 'dana@example.com');
    expect(r.messages.map((m) => m.subject)).toEqual(['Budget', 'Re: Budget', 'Offsite']);
    expect([r.aToB, r.bToA, r.shared]).toEqual([1, 2, 0]);
  });

  it('optionally adds mail both only received', () => {
    const r = between(all, 'sam@example.com', 'dana@example.com', true);
    expect(r.messages.map((m) => m.subject)).toEqual(['Budget', 'Re: Budget', 'Offsite', 'Newsletter']);
    expect(r.shared).toBe(1);
  });

  it('returns nothing for a missing or identical pair', () => {
    expect(between(all, 'sam@example.com', '').messages).toEqual([]);
    expect(between(all, 'sam@example.com', 'sam@example.com').messages).toEqual([]);
  });
});

describe('cross-thread replay', () => {
  const threadOf = (m: MessageMeta) => (m.subject.replace(/^Re: /, '') === 'Budget' ? 'budget' : 'offsite');
  const { entries } = buildReplay(between(all, 'sam@example.com', 'dana@example.com').messages, { threadOf });

  it('marks where each thread starts', () => {
    expect(entries.map((e) => [e.thread, e.threadStart])).toEqual([
      ['budget', true],
      ['budget', false],
      ['offsite', true],
    ]);
  });

  it('does not report recipient changes between unrelated threads', () => {
    expect(entries[1].added).toEqual([LEE]);
    expect(entries[2].added).toEqual([]);
    expect(entries[2].removed).toEqual([]);
  });
});
