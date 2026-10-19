import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type { MessageMeta } from '../lib/types';
import { displayName } from '../lib/format';
import { navigate, viewToHash, type View } from '../lib/router';
import { between, correspondents, directory, type Person } from '../lib/people';
import { Avatar, Checkbox, IconButton, useDismiss } from './ui';
import { Icon } from './Icon';
import { ReplayTimeline } from './ReplayTimeline';

type PeopleView = Extract<View, { kind: 'people' }>;

const MAX_OPTIONS = 8;

function PersonPicker({
  label,
  value,
  people,
  byKey,
  counts,
  countsWith,
  exclude,
  onChange,
}: {
  label: string;
  value: string;
  people: Person[];
  byKey: Map<string, Person>;
  /** Messages exchanged with the other chosen person, to rank suggestions by. */
  counts: Map<string, number> | null;
  countsWith: string;
  exclude: string;
  onChange: (key: string) => void;
}) {
  const me = useStore((s) => s.settings.meAddresses);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  useDismiss(box, open, () => setOpen(false));

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    let pool = people.filter((p) => p.key !== exclude);
    if (q) pool = pool.filter((p) => p.key.includes(q) || p.addr.name.toLowerCase().includes(q));
    if (counts) {
      // People who wrote with the other person come first, most mail first.
      pool = [...pool].sort((x, y) => (counts.get(y.key) ?? 0) - (counts.get(x.key) ?? 0));
      if (!q) pool = pool.filter((p) => counts.has(p.key));
    }
    return pool.slice(0, MAX_OPTIONS);
  }, [people, query, counts, exclude]);

  const pick = (p: Person) => {
    onChange(p.key);
    setQuery('');
    setOpen(false);
  };

  if (value) {
    const p = byKey.get(value);
    const addr = p?.addr ?? { name: '', address: value };
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface py-1 pr-1 pl-1">
        <Avatar addr={addr} size={28} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-medium text-ink">{displayName(addr, me)}</div>
          <div className="truncate text-xs text-ink-3">{addr.address}</div>
        </div>
        <IconButton dense icon="close" label={`Clear ${label}`} onClick={() => onChange('')} />
      </div>
    );
  }

  return (
    <div ref={box} className="relative min-w-0 flex-1">
      <div className="flex h-[38px] items-center gap-2 rounded-full bg-search px-3 focus-within:bg-surface focus-within:ring-1 focus-within:ring-line-strong">
        <Icon name="person" size={20} className="text-ink-3" />
        <input
          ref={input}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
          value={query}
          placeholder={`${label}: name or email`}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(options.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter' && open && options[active]) {
              e.preventDefault();
              pick(options[active]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
            // Keep app-wide single-key shortcuts from firing while typing.
            e.stopPropagation();
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
        />
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="popover-shadow absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-lg bg-popover py-1">
          {options.length === 0 && (
            <li className="px-4 py-3 text-sm text-ink-3">{counts && !query ? `No one else wrote with ${countsWith}.` : 'No one matches.'}</li>
          )}
          {options.map((p, i) => {
            const shared = counts?.get(p.key) ?? 0;
            return (
              <li
                key={p.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 px-3 py-1.5 ${i === active ? 'bg-hover' : ''}`}
              >
                <Avatar addr={p.addr} size={28} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-sm text-ink">{displayName(p.addr, me)}</div>
                  <div className="truncate text-xs text-ink-3">{p.addr.address}</div>
                </div>
                <span className="shrink-0 text-xs text-ink-3 tabular-nums">
                  {counts ? (shared ? `${shared.toLocaleString()} with ${countsWith}` : '') : `${(p.sent + p.received).toLocaleString()} emails`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PeopleTimeline({ view }: { view: PeopleView }) {
  const messages = useStore((s) => s.messages);
  const msgToThread = useStore((s) => s.msgToThread);
  const me = useStore((s) => s.settings.meAddresses);
  const [includeShared, setIncludeShared] = useState(false);

  const people = useMemo(() => directory(messages.values()), [messages]);
  const byKey = useMemo(() => new Map(people.map((p) => [p.key, p])), [people]);
  const withA = useMemo(() => (view.a ? correspondents(messages.values(), view.a) : null), [messages, view.a]);
  const withB = useMemo(() => (view.b ? correspondents(messages.values(), view.b) : null), [messages, view.b]);
  const result = useMemo(() => between(messages.values(), view.a, view.b, includeShared), [messages, view.a, view.b, includeShared]);

  const threadOf = useCallback((m: MessageMeta) => msgToThread.get(m.id) ?? m.id, [msgToThread]);
  const openThread = useCallback(
    (m: MessageMeta) => {
      const tid = msgToThread.get(m.id);
      if (tid) location.hash = viewToHash(view) + '/' + tid;
    },
    [msgToThread, view],
  );
  const threadCount = useMemo(() => new Set(result.messages.map(threadOf)).size, [result, threadOf]);

  const setPair = (a: string, b: string) => navigate({ view: { kind: 'people', a, b }, threadId: null });
  const nameOf = (key: string) => displayName(byKey.get(key)?.addr ?? { name: '', address: key }, me);
  const ready = view.a && view.b && view.a !== view.b;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 pr-4 pl-4">
        <Icon name="timeline" size={20} className="text-ink-2" />
        <h1 className="font-display text-base text-ink">People timeline</h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-16">
        <div className="pt-1 pr-4 pb-4 pl-4 sm:pl-[72px]">
          <p className="mb-3 max-w-2xl text-sm text-ink-2">
            Pick two people to see every email between them, across all conversations, in the order it happened.
          </p>
          <div className="flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center">
            <PersonPicker label="Person A" value={view.a} people={people} byKey={byKey} counts={withB} countsWith={view.b ? nameOf(view.b) : ''} exclude={view.b} onChange={(k) => setPair(k, view.b)} />
            <IconButton
              icon="sync_alt"
              label="Swap people"
              disabled={!view.a && !view.b}
              className="self-center max-sm:rotate-90"
              onClick={() => setPair(view.b, view.a)}
            />
            <PersonPicker label="Person B" value={view.b} people={people} byKey={byKey} counts={withA} countsWith={view.a ? nameOf(view.a) : ''} exclude={view.a} onChange={(k) => setPair(view.a, k)} />
          </div>
          <div className="mt-2 -ml-2">
            <label className="inline-flex cursor-pointer items-center text-sm text-ink-2">
              <Checkbox checked={includeShared} onChange={(c) => setIncludeShared(c)} label="Include emails both only received" />
              <span>Also include emails both only received (neither one sent)</span>
            </label>
          </div>

          {ready && (
            <p className="mt-3 text-sm text-ink" aria-live="polite">
              {result.messages.length === 0 ? (
                <span className="text-ink-2">
                  No emails between {nameOf(view.a)} and {nameOf(view.b)} in the loaded mail.
                </span>
              ) : (
                <>
                  <span className="font-medium">
                    {nameOf(view.a)} → {nameOf(view.b)}: {result.aToB.toLocaleString()}
                  </span>
                  {' · '}
                  <span className="font-medium">
                    {nameOf(view.b)} → {nameOf(view.a)}: {result.bToA.toLocaleString()}
                  </span>
                  {includeShared && result.shared > 0 && <> · both received: {result.shared.toLocaleString()}</>}
                  <span className="text-ink-2">
                    {' '}
                    · across {threadCount.toLocaleString()} {threadCount === 1 ? 'conversation' : 'conversations'}
                  </span>
                </>
              )}
            </p>
          )}
        </div>

        {ready && result.messages.length > 0 && <ReplayTimeline msgs={result.messages} threadOf={threadOf} openThread={openThread} />}

        {!ready && (
          <div className="flex flex-col items-center gap-2 px-4 pt-12 text-center text-sm text-ink-3">
            <Icon name="group" size={48} className="text-line-strong" />
            {people.length < 2 ? 'This mailbox has fewer than two people in it.' : 'Choose two people above.'}
          </div>
        )}
      </div>
    </div>
  );
}
