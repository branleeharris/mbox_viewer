import type { MessageMeta, Thread } from './types';
import { L } from './labels';

/**
 * Group messages into conversations.
 *
 * 1. Messages sharing a Gmail thread id (X-GM-THRID, present in Takeout) are one thread.
 * 2. Otherwise messages are linked through Message-ID / In-Reply-To / References.
 *
 * Subject-only grouping is deliberately not used: it merges unrelated mail that
 * happens to share a subject like "Meeting".
 */
export function buildThreads(messages: Iterable<MessageMeta>): Map<string, Thread> {
  const list = [...messages];
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression.
    let cur = x;
    while (cur !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const add = (x: string) => {
    if (!parent.has(x)) parent.set(x, x);
  };
  const union = (a: string, b: string) => {
    add(a);
    add(b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const m of list) {
    const node = 'm:' + m.id;
    add(node);
    if (m.gmThreadId) union(node, 'g:' + m.gmThreadId);
    if (m.messageId) union(node, 'id:' + m.messageId);
    // Gmail thread ids are authoritative; don't let stray References merge Takeout threads.
    if (!m.gmThreadId) {
      if (m.inReplyTo) union(node, 'id:' + m.inReplyTo);
      for (const r of m.references) union(node, 'id:' + r);
    }
  }

  const groups = new Map<string, MessageMeta[]>();
  for (const m of list) {
    const root = find('m:' + m.id);
    let g = groups.get(root);
    if (!g) groups.set(root, (g = []));
    g.push(m);
  }

  const threads = new Map<string, Thread>();
  for (const msgs of groups.values()) {
    msgs.sort((a, b) => a.date - b.date || a.offset - b.offset);
    const gm = msgs.find((m) => m.gmThreadId)?.gmThreadId;
    const id = gm ? 'g' + gm : 't' + msgs[0].id.replace(/[^a-z0-9]/gi, '');
    threads.set(id, summarize(id, msgs));
  }
  return threads;
}

export function summarize(id: string, msgs: MessageMeta[]): Thread {
  const labels = new Set<string>();
  let unread = false;
  let starred = false;
  let important = false;
  let hasAttachments = false;
  let junk = true;
  for (const m of msgs) {
    for (const l of m.labels) labels.add(l);
    unread ||= m.unread;
    starred ||= m.starred;
    important ||= m.important;
    hasAttachments ||= m.attachments.length > 0;
    junk &&= m.labels.includes(L.spam) || m.labels.includes(L.trash);
  }
  const first = msgs.find((m) => m.subject) ?? msgs[0];
  return {
    id,
    messageIds: msgs.map((m) => m.id),
    subject: first.subject,
    lastDate: msgs[msgs.length - 1].date,
    labels,
    unread,
    starred,
    important,
    hasAttachments,
    junk,
  };
}
