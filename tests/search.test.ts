import { describe, expect, it } from 'vitest';
import { parseQuery, matchMessage, textTerms, highlightTerms, type EvalContext } from '../src/lib/search/query';
import { splitQuotedText } from '../src/lib/quotes';
import { L } from '../src/lib/labels';
import type { MessageMeta } from '../src/lib/types';

const m: MessageMeta = {
  id: 's:1', sourceId: 's', offset: 0, headerOffset: 0, length: 3 * 1024 * 1024, messageId: 'abc@x', dedupeKey: '',
  references: [], from: { name: 'Jane Doe', address: 'jane@client.example' }, to: [{ name: '', address: 'owner@example.com' }],
  cc: [], bcc: [], replyTo: [], subject: 'Q3 budget review', date: new Date(2024, 2, 4).getTime(), snippet: '',
  labels: [L.inbox, 'Work/Clients'], attachments: [{ name: 'budget.pdf', type: 'application/pdf', size: 10 }],
  unread: true, starred: false, important: true,
};

function ctx(hits: Record<string, boolean> = {}): EvalContext {
  return {
    text: new Map(Object.entries(hits).map(([k, v]) => [k, new Set(v ? ['s:1'] : [])])),
    me: ['owner@example.com'],
  };
}

const match = (q: string, hits?: Record<string, boolean>) => matchMessage(parseQuery(q), m, ctx(hits));

describe('search operators', () => {
  it('matches address fields and "me"', () => {
    expect(match('from:jane')).toBe(true);
    expect(match('from:doe')).toBe(true);
    expect(match('to:me')).toBe(true);
    expect(match('from:me')).toBe(false);
  });
  it('matches labels, folders and flags', () => {
    expect(match('label:work-clients')).toBe(true);
    expect(match('label:"Work/Clients"')).toBe(true);
    expect(match('in:inbox is:unread is:important')).toBe(true);
    expect(match('is:starred')).toBe(false);
    expect(match('-is:starred')).toBe(true);
  });
  it('matches attachments, sizes and dates', () => {
    expect(match('has:attachment filename:pdf')).toBe(true);
    expect(match('larger:2M smaller:5M')).toBe(true);
    expect(match('larger:5M')).toBe(false);
    expect(match('after:2024/03/01 before:2024/03/05')).toBe(true);
    expect(match('before:2024/03/01')).toBe(false);
  });
  it('supports OR, groups and negated free text', () => {
    expect(match('budget', { budget: true })).toBe(true);
    expect(match('foo OR budget', { foo: false, budget: true })).toBe(true);
    expect(match('{foo bar}', { foo: false, bar: false })).toBe(false);
    expect(match('-budget', { budget: true })).toBe(false);
    expect(match('(foo OR budget) from:jane', { foo: false, budget: true })).toBe(true);
  });
  it('extracts terms for the full-text index and highlighting', () => {
    const ast = parseQuery('from:jane "q3 budget" -spam subject:review');
    expect(textTerms(ast).sort()).toEqual(['q3 budget', 'spam']);
    expect(highlightTerms(ast).sort()).toEqual(['q3 budget', 'review']);
  });
});

describe('splitQuotedText', () => {
  it('splits at a wrapped Gmail attribution', () => {
    const r = splitQuotedText('Sounds good.\n\nOn Mon, Mar 4, 2024 at 10:15 AM Jane Doe\n<jane@x.com> wrote:\n> hello\n> there\n');
    expect(r.main).toBe('Sounds good.');
    expect(r.quoted).toMatch(/^On Mon/);
  });
  it('splits at an Outlook header block', () => {
    const r = splitQuotedText('Yes.\n\nFrom: Bob\nSent: Monday\nTo: Jane\nSubject: Hi\n\nOld text');
    expect(r.main).toBe('Yes.');
  });
  it('leaves messages that are entirely quoted alone', () => {
    const t = '> only quote\n> here';
    expect(splitQuotedText(t)).toEqual({ main: t, quoted: '' });
  });
  it('does not trim forwarded messages', () => {
    const t = 'FYI\n\n---------- Forwarded message ---------\nFrom: x';
    expect(splitQuotedText(t).quoted).toBe('');
  });
});
