import type { Addr, MessageMeta } from './types';
import { L } from './labels';
import { addrKey } from './replay';

/**
 * "Between two people" investigation: everyone in the archive, and every message
 * one person sent the other, across all threads.
 */

export interface Person {
  key: string;
  addr: Addr;
  sent: number;
  received: number;
}

/** Spam and unsent drafts aren't part of anyone's conversation history. Trash is kept. */
export const countsAsSent = (m: MessageMeta) => !m.labels.includes(L.spam) && !m.labels.includes(L.drafts);

const recipients = (m: MessageMeta) => [...m.to, ...m.cc, ...m.bcc];

/** Everyone who sent or received mail, busiest first. Keeps the most common display name. */
export function directory(messages: Iterable<MessageMeta>): Person[] {
  const people = new Map<string, Person & { names: Map<string, number> }>();
  const touch = (a: Addr, field: 'sent' | 'received') => {
    const key = addrKey(a);
    if (!key || !key.includes('@')) return;
    let p = people.get(key);
    if (!p) people.set(key, (p = { key, addr: { name: '', address: a.address.toLowerCase() }, sent: 0, received: 0, names: new Map() }));
    p[field]++;
    const name = a.name.replace(/^["']|["']$/g, '').trim();
    if (name) p.names.set(name, (p.names.get(name) ?? 0) + 1);
  };
  for (const m of messages) {
    if (!countsAsSent(m)) continue;
    touch(m.from, 'sent');
    const seen = new Set<string>();
    for (const a of recipients(m)) {
      const k = addrKey(a);
      if (seen.has(k)) continue;
      seen.add(k);
      touch(a, 'received');
    }
  }
  return [...people.values()]
    .map(({ names, ...p }) => {
      const best = [...names].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
      return { ...p, addr: { ...p.addr, name: best } };
    })
    .sort((x, y) => y.sent + y.received - (x.sent + x.received) || x.key.localeCompare(y.key));
}

/** How many messages each person exchanged with `key` (either direction). */
export function correspondents(messages: Iterable<MessageMeta>, key: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of messages) {
    if (!countsAsSent(m)) continue;
    const from = addrKey(m.from);
    const to = new Set(recipients(m).map(addrKey));
    const others = from === key ? to : to.has(key) ? new Set([from]) : null;
    if (!others) continue;
    for (const k of others) if (k && k !== key) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

export interface Between {
  /** Oldest first. */
  messages: MessageMeta[];
  aToB: number;
  bToA: number;
  /** Both were only recipients (included when asked for). */
  shared: number;
}

/** Messages where one of `a` / `b` wrote to the other; optionally also mail both only received. */
export function between(all: Iterable<MessageMeta>, a: string, b: string, includeShared = false): Between {
  const out: Between = { messages: [], aToB: 0, bToA: 0, shared: 0 };
  if (!a || !b || a === b) return out;
  for (const m of all) {
    if (!countsAsSent(m)) continue;
    const from = addrKey(m.from);
    const to = new Set(recipients(m).map(addrKey));
    if (from === a && to.has(b)) out.aToB++;
    else if (from === b && to.has(a)) out.bToA++;
    else if (includeShared && to.has(a) && to.has(b)) out.shared++;
    else continue;
    out.messages.push(m);
  }
  out.messages.sort((x, y) => x.date - y.date || x.offset - y.offset);
  return out;
}
