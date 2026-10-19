import type { Addr, AttachmentMeta, MessageMeta } from './types';

/**
 * Conversation replay: turns a thread's messages into timeline entries that
 * explain what changed at each step — time passed, who answered whom, who was
 * added or dropped, and which attachments showed up for the first time.
 */

export interface ReplayAttachment extends AttachmentMeta {
  /** False when the same file (name + size) was already sent earlier. */
  first: boolean;
}

export interface ReplayEntry {
  m: MessageMeta;
  /** Position in the replay, 0-based. */
  index: number;
  /** Local-day key ("2026-10-12"), or "" when the date is unknown. */
  day: string;
  /** First entry of its day: render a date header above it. */
  newDay: boolean;
  /** Time since the previous entry, or null when either date is unknown. */
  gapMs: number | null;
  /** Index of the message this one answers, when known and NOT the previous entry. */
  replyToIndex: number | null;
  /** People on this message who weren't on the one it answers (or the previous one). */
  added: Addr[];
  /** People on the earlier message who were left off this one. */
  removed: Addr[];
  attachments: ReplayAttachment[];
  /** Thread this message belongs to ("" for single-thread replays). */
  thread: string;
  /** First entry from its thread in this replay. */
  threadStart: boolean;
}

export interface ReplayOptions {
  /**
   * Thread of each message, for replays that span several conversations. Without
   * it every message is treated as one thread. Recipient changes are only compared
   * within a thread, since unrelated threads naturally have different people.
   */
  threadOf?: (m: MessageMeta) => string;
}

export interface ReplayParticipant {
  addr: Addr;
  /** Messages this person sent. */
  sent: number;
}

export interface Replay {
  entries: ReplayEntry[];
  /** Senders first (by first message), then people who only received. */
  participants: ReplayParticipant[];
  /** Epoch ms of the first and last dated messages, 0 when unknown. */
  start: number;
  end: number;
}

export const addrKey = (a: Addr): string => (a.address || a.name).trim().toLowerCase();

function dayKey(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Everyone on a message: sender plus visible recipients, keyed by address. */
function people(m: MessageMeta): Map<string, Addr> {
  const out = new Map<string, Addr>();
  for (const a of [m.from, ...m.to, ...m.cc]) {
    const k = addrKey(a);
    if (k && !out.has(k)) out.set(k, a);
  }
  return out;
}

/** Index of the message `m` answers: In-Reply-To first, then the newest known Reference. */
function parentIndex(m: MessageMeta, byMessageId: Map<string, number>, before: number): number | null {
  const candidates = [m.inReplyTo, ...[...m.references].reverse()];
  for (const id of candidates) {
    if (!id) continue;
    const i = byMessageId.get(id);
    if (i !== undefined && i < before) return i;
  }
  return null;
}

/** Build the replay. `messages` must already be sorted oldest first (as threads are). */
export function buildReplay(messages: MessageMeta[], opts: ReplayOptions = {}): Replay {
  const threadOf = opts.threadOf ?? (() => '');
  const byMessageId = new Map<string, number>();
  messages.forEach((m, i) => {
    if (m.messageId && !byMessageId.has(m.messageId)) byMessageId.set(m.messageId, i);
  });

  const seenFiles = new Set<string>();
  const participants = new Map<string, ReplayParticipant>();
  const receivers = new Map<string, Addr>();
  const entries: ReplayEntry[] = [];
  /** Last message seen from each thread. */
  const lastInThread = new Map<string, MessageMeta>();
  let prevDay: string | null = null;

  messages.forEach((m, i) => {
    const prev = i > 0 ? messages[i - 1] : null;
    const day = dayKey(m.date);
    const parent = parentIndex(m, byMessageId, i);
    const thread = threadOf(m);

    // Compare recipients with the message being answered; fall back to the previous one in the same thread.
    const base = parent !== null ? messages[parent] : (lastInThread.get(thread) ?? null);
    const added: Addr[] = [];
    const removed: Addr[] = [];
    if (base) {
      const now = people(m);
      const before = people(base);
      for (const [k, a] of now) if (!before.has(k)) added.push(a);
      for (const [k, a] of before) if (!now.has(k)) removed.push(a);
    }

    const attachments = m.attachments.map((a) => {
      const key = `${a.name.toLowerCase()}|${a.size}`;
      const first = !seenFiles.has(key);
      seenFiles.add(key);
      return { ...a, first };
    });

    const fk = addrKey(m.from);
    if (fk) {
      const p = participants.get(fk);
      if (p) p.sent++;
      else participants.set(fk, { addr: m.from, sent: 1 });
    }
    for (const a of [...m.to, ...m.cc]) {
      const k = addrKey(a);
      if (k && !receivers.has(k)) receivers.set(k, a);
    }

    entries.push({
      m,
      index: i,
      day,
      newDay: day !== prevDay,
      gapMs: prev && prev.date && m.date ? Math.max(0, m.date - prev.date) : null,
      replyToIndex: parent !== null && parent !== i - 1 ? parent : null,
      added,
      removed,
      attachments,
      thread,
      threadStart: !lastInThread.has(thread),
    });
    lastInThread.set(thread, m);
    prevDay = day;
  });

  for (const [k, a] of receivers) if (!participants.has(k)) participants.set(k, { addr: a, sent: 0 });

  const dated = messages.filter((m) => m.date);
  return {
    entries,
    participants: [...participants.values()],
    start: dated[0]?.date ?? 0,
    end: dated[dated.length - 1]?.date ?? 0,
  };
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "3 hours later", "2 days later"; null when the gap is too short to call out. */
export function gapLabel(ms: number | null): string | null {
  if (ms === null || ms < HOUR) return null;
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'} later`;
  if (ms < DAY) return unit(Math.floor(ms / HOUR), 'hour');
  if (ms < 14 * DAY) return unit(Math.floor(ms / DAY), 'day');
  if (ms < 60 * DAY) return unit(Math.floor(ms / (7 * DAY)), 'week');
  if (ms < 365 * DAY) return unit(Math.floor(ms / (30 * DAY)), 'month');
  return unit(Math.floor(ms / (365 * DAY)), 'year');
}

/** Long gaps get a dashed stretch of rail. */
export const isLongGap = (ms: number | null) => ms !== null && ms >= DAY;

/** "6 days", "3 hours", "12 minutes" — the span of the whole conversation. */
export function spanLabel(start: number, end: number): string | null {
  if (!start || !end || end <= start) return null;
  const ms = end - start;
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (ms < HOUR) return unit(Math.max(1, Math.round(ms / MIN)), 'minute');
  if (ms < DAY) return unit(Math.round(ms / HOUR), 'hour');
  if (ms < 60 * DAY) return unit(Math.round(ms / DAY), 'day');
  if (ms < 365 * DAY) return unit(Math.round(ms / (30 * DAY)), 'month');
  return unit(Math.round((ms / (365 * DAY)) * 10) / 10, 'year');
}
