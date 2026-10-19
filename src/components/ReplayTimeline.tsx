import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Addr, MessageMeta } from '../lib/types';
import { avatarColor, displayName, formatBytes, fullDate } from '../lib/format';
import { parseFull } from '../lib/raw';
import { htmlToText } from '../lib/htmlText';
import { splitQuotedText } from '../lib/quotes';
import { buildReplay, gapLabel, isLongGap, spanLabel, addrKey, type ReplayEntry } from '../lib/replay';
import { Avatar, IconButton } from './ui';
import { Icon } from './Icon';
import { MessageBody } from './MessageBody';

const STEP_MS = 2600;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const timeOf = (ms: number) => (ms ? new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');

const dayHeading = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Date unknown';

const shortStamp = (ms: number) =>
  ms ? new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'an unknown date';

function rangeLabel(start: number, end: number): string {
  if (!start) return '';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  const a = new Date(start).toLocaleDateString([], opts);
  const b = new Date(end).toLocaleDateString([], opts);
  return a === b ? a : `${a} – ${b}`;
}

/** Only what this message added: the body with quoted history removed, loaded once the card is near the screen. */
function NewText({ m }: { m: MessageMeta }) {
  const source = useStore((s) => s.sources.get(m.sourceId));
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (!source) {
      setFailed(true);
      return;
    }
    let alive = true;
    parseFull(m, source).then(
      ({ email }) => {
        if (!alive) return;
        const body = email.text?.trim() ? email.text : htmlToText(email.html ?? '');
        const main = splitQuotedText(body).main.replace(/\[(?:cid|image):[^\]]*\]/gi, '').replace(/\n{3,}/g, '\n\n').trim();
        setText(main);
      },
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [visible, m, source]);

  let content;
  if (failed) content = <p className="text-sm text-ink-2">{m.snippet || <span className="italic text-ink-3">(Message body unavailable.)</span>}</p>;
  else if (text === null)
    content = (
      <div className="space-y-2 py-1" aria-busy="true" aria-label="Loading message">
        <div className="h-3 w-3/4 animate-pulse rounded bg-chip" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-chip" />
      </div>
    );
  else if (!text) content = <p className="text-sm italic text-ink-3">(No new text in this message.)</p>;
  else {
    const long = text.length > 700 || text.split('\n').length > 10;
    content = (
      <>
        <p className={`text-sm leading-relaxed break-words whitespace-pre-wrap text-ink ${long && !more ? 'line-clamp-[8]' : ''}`}>{text}</p>
        {long && (
          <button type="button" onClick={() => setMore((v) => !v)} className="mt-1 text-xs font-medium text-accent hover:underline">
            {more ? 'Show less' : 'Show more'}
          </button>
        )}
      </>
    );
  }
  return <div ref={ref}>{content}</div>;
}

function PeopleChip({ addrs, kind }: { addrs: Addr[]; kind: 'added' | 'removed' }) {
  const me = useStore((s) => s.settings.meAddresses);
  const names = addrs.map((a) => displayName(a, me));
  const label = `${names.join(', ')} ${kind === 'added' ? 'added' : 'dropped'}`;
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-chip py-0.5 pr-2.5 pl-1.5 text-xs text-chip-ink" title={label}>
      <Icon name={kind === 'added' ? 'person_add' : 'person_remove'} size={14} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function EntryCard({
  e,
  entries,
  state,
  flash,
  onJump,
  openThread,
}: {
  e: ReplayEntry;
  entries: ReplayEntry[];
  state: 'past' | 'active' | 'future' | 'idle';
  flash: boolean;
  onJump: (index: number) => void;
  openThread?: (m: MessageMeta) => void;
}) {
  const me = useStore((s) => s.settings.meAddresses);
  const source = useStore((s) => s.sources.get(e.m.sourceId));
  const [full, setFull] = useState(false);
  const { m } = e;
  const recipients = [...m.to, ...m.cc];
  const toNames = recipients.map((a) => displayName(a, me, recipients.length > 1));
  const parent = e.replyToIndex !== null ? entries[e.replyToIndex].m : null;

  return (
    <article
      aria-label={`Message ${e.index + 1}: ${displayName(m.from, me)}, ${fullDate(m.date)}`}
      aria-current={state === 'active' ? 'step' : undefined}
      className={`min-w-0 rounded-xl border border-l-[3px] border-line bg-surface p-3 transition-[opacity,box-shadow] duration-300 sm:p-4 ${
        state === 'future' ? 'opacity-35' : ''
      } ${state === 'active' || flash ? 'ring-2 ring-accent' : ''}`}
      style={{ borderLeftColor: avatarColor(m.from.address || m.from.name) }}
    >
      {openThread && (
        <button
          type="button"
          onClick={() => openThread(m)}
          className="mb-1.5 flex max-w-full items-center gap-1.5 text-xs text-ink-2 hover:text-accent"
          title="Open this conversation"
        >
          <Icon name="forum" size={14} className="shrink-0" />
          <span className="truncate font-medium">{m.subject || '(no subject)'}</span>
          {e.threadStart && <span className="shrink-0 rounded bg-accent-soft px-1.5 text-[11px] leading-4 text-nav-active-ink">New thread</span>}
          <Icon name="open_in_new" size={12} className="shrink-0" />
        </button>
      )}

      <header className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        <span className="truncate text-sm font-bold text-ink">{displayName(m.from, me)}</span>
        <span className="min-w-0 truncate text-xs text-ink-3" title={recipients.map((a) => a.address || a.name).join(', ')}>
          → {toNames.length ? toNames.slice(0, 4).join(', ') + (toNames.length > 4 ? ` +${toNames.length - 4}` : '') : 'undisclosed recipients'}
        </span>
        <time className="ml-auto shrink-0 text-xs text-ink-3 sm:hidden" dateTime={m.date ? new Date(m.date).toISOString() : undefined}>
          {timeOf(m.date)}
        </time>
      </header>

      {parent && (
        <button
          type="button"
          onClick={() => onJump(e.replyToIndex!)}
          className="mt-1 flex max-w-full items-center gap-1 text-xs text-ink-2 hover:text-accent hover:underline"
          title="Jump to that message"
        >
          <Icon name="reply" size={14} className="shrink-0" />
          <span className="truncate">
            Replying to {displayName(parent.from, me)} · {shortStamp(parent.date)}
          </span>
        </button>
      )}

      {(e.added.length > 0 || e.removed.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {e.added.length > 0 && <PeopleChip addrs={e.added} kind="added" />}
          {e.removed.length > 0 && <PeopleChip addrs={e.removed} kind="removed" />}
        </div>
      )}

      <div className="mt-2">{full ? <MessageBody meta={m} source={source} /> : <NewText m={m} />}</div>

      {!full && e.attachments.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Attachments">
          {e.attachments.map((a, i) => (
            <li
              key={i}
              className={`inline-flex max-w-full items-center gap-1 rounded-md border border-line px-2 py-0.5 text-xs ${a.first ? 'text-ink' : 'text-ink-3'}`}
              title={`${a.name} · ${formatBytes(a.size)}${a.first ? '' : ' · sent earlier in this conversation'}`}
            >
              <Icon name="attach_file" size={14} className="shrink-0" />
              <span className="truncate">{a.name || 'attachment'}</span>
              {!a.first && <span className="shrink-0 italic">again</span>}
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={() => setFull((v) => !v)} className="mt-2 text-xs font-medium text-accent hover:underline">
        {full ? 'Show only new text' : 'Show full message'}
      </button>
    </article>
  );
}

export function ReplayTimeline({
  msgs,
  threadOf,
  openThread,
}: {
  /** Oldest first. */
  msgs: MessageMeta[];
  /** For timelines spanning several threads; keep it stable (memoized). */
  threadOf?: (m: MessageMeta) => string;
  /** Shows each message's subject as a link that opens its thread. */
  openThread?: (m: MessageMeta) => void;
}) {
  const me = useStore((s) => s.settings.meAddresses);
  const replay = useMemo(() => buildReplay(msgs, { threadOf }), [msgs, threadOf]);
  const { entries, participants } = replay;
  const last = entries.length - 1;
  /** Replay position; null shows the whole conversation at once. */
  const [cursor, setCursorState] = useState<number | null>(null);
  // Mirrors `cursor` so rapid key presses build on each other instead of a stale render.
  const cursorRef = useRef<number | null>(null);
  const setCursor = (c: number | null) => {
    cursorRef.current = c;
    setCursorState(c);
  };
  const [playing, setPlaying] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  const scrollTo = (i: number) =>
    items.current[i]?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });

  const step = (i: number) => {
    const next = Math.max(0, Math.min(last, i));
    setCursor(next);
    scrollTo(next);
  };
  /** Move by `dir`; from "show all", forward starts at the first message and back at the last. */
  const move = (dir: number) => {
    setPlaying(false);
    const c = cursorRef.current;
    step(c === null ? (dir > 0 ? 0 : last) : c + dir);
  };

  // Autoplay: advance one message at a time, stop on the last.
  useEffect(() => {
    if (!playing) return;
    if (cursor !== null && cursor >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => step(cursor === null ? 0 : cursor + 1), cursor === null ? 0 : STEP_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, cursor, last]);

  // n / p step through the replay.
  useEffect(() => {
    const onNav = (ev: Event) => move((ev as CustomEvent<number>).detail);
    window.addEventListener('mv:message-nav', onNav);
    return () => window.removeEventListener('mv:message-nav', onNav);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);

  useEffect(() => {
    if (flash === null) return;
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  const jump = (i: number) => {
    setFlash(i);
    scrollTo(i);
  };

  const togglePlay = () => {
    if (playing) setPlaying(false);
    else {
      if (cursor !== null && cursor >= last) setCursor(null);
      setPlaying(true);
    }
  };

  const span = spanLabel(replay.start, replay.end);
  const senders = participants.filter((p) => p.sent > 0).length;

  return (
    <div className="pr-4 pl-4 sm:pl-[72px]">
      {/* Summary + who's who */}
      <div className="mb-4 rounded-xl bg-app p-3 sm:p-4">
        <p className="text-sm text-ink">
          <span className="font-medium">{entries.length.toLocaleString()} messages</span>
          {' · '}
          {participants.length} {participants.length === 1 ? 'person' : 'people'}
          {span && <> · over {span}</>}
        </p>
        {replay.start > 0 && <p className="mt-0.5 text-xs text-ink-3">{rangeLabel(replay.start, replay.end)}</p>}
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="People in this conversation">
          {participants.map((p) => (
            <li
              key={addrKey(p.addr)}
              className={`inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pr-2.5 pl-1 text-xs ${p.sent ? 'text-ink' : 'text-ink-3'}`}
              title={`${p.addr.address || p.addr.name} · ${p.sent ? `sent ${p.sent}` : 'only received'}`}
            >
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.sent ? avatarColor(p.addr.address || p.addr.name) : 'var(--line-strong)' }} />
              <span className="truncate">{displayName(p.addr, me)}</span>
              {p.sent > 0 && <span className="text-ink-3">{p.sent}</span>}
            </li>
          ))}
        </ul>
        {senders < participants.length && <p className="mt-2 text-xs text-ink-3">Grey names were copied but never wrote back.</p>}
      </div>

      <ol className="relative">
        {entries.map((e) => {
          const gap = gapLabel(e.gapMs);
          const long = isLongGap(e.gapMs);
          const state = cursor === null ? 'idle' : e.index < cursor ? 'past' : e.index === cursor ? 'active' : 'future';
          return [
            gap && (
              <li key={`gap-${e.index}`} aria-hidden="true" className="grid grid-cols-[32px_1fr] gap-x-3 sm:grid-cols-[64px_32px_1fr]">
                <span className="max-sm:hidden" />
                <span className="flex justify-center">
                  <span className={`w-0 border-l-2 ${long ? 'h-14 border-dashed border-line-strong' : 'h-7 border-line'}`} />
                </span>
                <span className={`self-center text-xs italic ${long ? 'text-ink-2' : 'text-ink-3'}`}>{gap}</span>
              </li>
            ),
            e.newDay && (
              <li key={`day-${e.index}`} className="sticky top-0 z-10 -mx-1 grid grid-cols-[32px_1fr] gap-x-3 bg-surface/95 px-1 py-2 backdrop-blur sm:grid-cols-[64px_32px_1fr]">
                <span className="max-sm:hidden" />
                <span className="flex items-center justify-center">
                  <Icon name="calendar_month" size={16} className="text-ink-3" />
                </span>
                <h2 className="font-display text-sm font-medium text-ink">{dayHeading(e.m.date)}</h2>
              </li>
            ),
            <li
              key={e.m.id}
              ref={(el) => {
                items.current[e.index] = el;
              }}
              className="grid scroll-my-24 grid-cols-[32px_1fr] gap-x-3 sm:grid-cols-[64px_32px_1fr]"
            >
              <time className="pt-4 text-right text-xs text-ink-3 tabular-nums max-sm:hidden" dateTime={e.m.date ? new Date(e.m.date).toISOString() : undefined} title={fullDate(e.m.date)}>
                {timeOf(e.m.date)}
              </time>
              <div className="relative flex justify-center">
                {/* The rail: runs through every message, starting and ending at the first/last avatar. */}
                <span
                  className={`absolute w-0.5 bg-line ${e.index === 0 ? 'top-5' : 'top-0'} ${e.index === last ? 'h-5' : 'bottom-0'}`}
                  aria-hidden="true"
                />
                <div className={`relative mt-2.5 rounded-full ring-4 ring-surface transition-opacity duration-300 ${state === 'future' ? 'opacity-35' : ''}`}>
                  <Avatar addr={e.m.from} size={32} />
                </div>
              </div>
              <div className="min-w-0 py-1.5">
                <EntryCard e={e} entries={entries} state={state} flash={flash === e.index} onJump={jump} openThread={openThread} />
              </div>
            </li>,
          ];
        })}
      </ol>

      {/* Replay controls */}
      {entries.length > 1 && (
        <div className="pointer-events-none sticky bottom-4 mt-6 flex justify-center">
          <div className="popover-shadow pointer-events-auto flex items-center gap-0.5 rounded-full bg-popover py-1 pr-3 pl-1 text-sm text-ink">
            <IconButton icon="chevron_left" label="Previous message (p)" disabled={cursor === 0} onClick={() => move(-1)} />
            <IconButton icon={playing ? 'pause' : 'play_arrow'} label={playing ? 'Pause replay' : 'Play replay'} onClick={togglePlay} />
            <IconButton icon="chevron_right" label="Next message (n)" disabled={cursor === last} onClick={() => move(1)} />
            <span className="ml-1 min-w-[4.5rem] text-xs text-ink-2 tabular-nums" aria-live="polite">
              {cursor === null ? `${entries.length} messages` : `${cursor + 1} of ${entries.length}`}
            </span>
            {cursor !== null && (
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setCursor(null);
                }}
                className="ml-1 rounded-full px-2 py-1 text-xs font-medium text-accent hover:bg-hover"
              >
                Show all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
