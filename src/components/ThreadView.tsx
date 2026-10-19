import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type { MessageMeta } from '../lib/types';
import { displayName, formatAddress, fullDate, isMe, messageDate } from '../lib/format';
import { isSystemLabel, L } from '../lib/labels';
import { viewToHash, viewTitle } from '../lib/router';
import { downloadEml } from '../lib/export';
import { Avatar, IconButton, LabelChip, Menu, useDismiss } from './ui';
import { Icon } from './Icon';
import { MessageBody } from './MessageBody';
import { ReplayTimeline } from './ReplayTimeline';
import { exportThreads } from './MailList';

function RecipientSummary({ m }: { m: MessageMeta }) {
  const me = useStore((s) => s.settings.meAddresses);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const all = [...m.to, ...m.cc, ...m.bcc];
  const names = all.map((a) => displayName(a, me, all.length > 1));
  const summary = names.length ? `to ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}` : 'to undisclosed recipients';
  const rows: [string, string][] = [
    ['from:', formatAddress(m.from)],
    ...(m.replyTo.length ? [['reply-to:', m.replyTo.map(formatAddress).join(', ')] as [string, string]] : []),
    ['to:', m.to.map(formatAddress).join(', ') || '—'],
    ...(m.cc.length ? [['cc:', m.cc.map(formatAddress).join(', ')] as [string, string]] : []),
    ...(m.bcc.length ? [['bcc:', m.bcc.map(formatAddress).join(', ')] as [string, string]] : []),
    ['date:', fullDate(m.date)],
    ['subject:', m.subject || '(no subject)'],
    ...(m.deliveredTo ? [['delivered to:', m.deliveredTo] as [string, string]] : []),
    ...(m.messageId ? [['message-id:', m.messageId] as [string, string]] : []),
  ];
  return (
    <div ref={ref} className="relative inline-flex min-w-0 items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex min-w-0 items-center text-xs text-ink-3 hover:text-ink"
        aria-expanded={open}
        aria-label="Show details"
      >
        <span className="truncate">{summary}</span>
        <Icon name="arrow_drop_down" size={18} />
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="popover-shadow absolute top-full left-0 z-40 mt-1 w-[min(560px,80vw)] rounded-lg bg-popover p-4 text-xs text-ink"
        >
          <table>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td className="py-0.5 pr-3 text-right align-top whitespace-nowrap text-ink-3">{k}</td>
                  <td className="py-0.5 break-all">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {all.some((a) => isMe(a, me)) && <p className="mt-2 text-ink-3">You were a recipient of this message.</p>}
        </div>
      )}
    </div>
  );
}

function MessageItem({
  m,
  expanded,
  onToggle,
  isLast,
}: {
  m: MessageMeta;
  expanded: boolean;
  onToggle: () => void;
  isLast: boolean;
}) {
  const source = useStore((s) => s.sources.get(m.sourceId));
  const me = useStore((s) => s.settings.meAddresses);
  const { setFlags, showToast } = useStore.getState();
  const draft = m.labels.includes(L.drafts);

  const star = (
    <IconButton
      dense
      icon="star"
      filled={m.starred}
      label={m.starred ? 'Starred' : 'Not starred'}
      iconClassName={m.starred ? 'text-star' : 'text-ink-3'}
      onClick={(e) => {
        e.stopPropagation();
        setFlags([m.id], { starred: !m.starred });
      }}
    />
  );

  if (!expanded) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => e.key === 'Enter' && onToggle()}
        className="flex cursor-pointer items-center gap-3 border-b border-line py-3 pr-2 pl-4 hover:bg-hover"
      >
        <Avatar addr={m.from} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`truncate text-sm ${m.unread ? 'font-bold text-ink' : 'font-medium text-ink'}`}>
              {draft ? <span className="text-danger">Draft</span> : displayName(m.from, me)}
            </span>
          </div>
          <div className="truncate text-sm text-ink-3">{m.snippet || ' '}</div>
        </div>
        {m.attachments.length > 0 && <Icon name="attach_file" size={16} className="text-ink-3" />}
        <span className="shrink-0 text-xs text-ink-3" title={fullDate(m.date)}>
          {messageDate(m.date).replace(/ \(.+\)$/, '')}
        </span>
        {star}
      </div>
    );
  }

  return (
    <article className={`py-4 pr-2 pl-4 ${isLast ? '' : 'border-b border-line'}`} aria-label={`Message from ${displayName(m.from)}`}>
      <div className="flex gap-3">
        <div className="cursor-pointer" onClick={onToggle}>
          <Avatar addr={m.from} size={40} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 cursor-pointer" onClick={onToggle}>
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-1">
                <span className="truncate text-sm font-bold text-ink">
                  {draft ? <span className="text-danger">Draft</span> : m.from.name || m.from.address || '(unknown sender)'}
                </span>
                {m.from.name && m.from.address && <span className="truncate text-xs text-ink-3">&lt;{m.from.address}&gt;</span>}
              </div>
              <RecipientSummary m={m} />
            </div>
            <span className="hidden shrink-0 pt-0.5 text-xs text-ink-3 sm:inline" title={fullDate(m.date)}>
              {messageDate(m.date)}
            </span>
            <div className="-mt-1.5 flex shrink-0 items-center">
              {star}
              <Menu
                align="right"
                trigger={({ toggle }) => <IconButton dense icon="more_vert" label="More" onClick={toggle} />}
                items={[
                  {
                    label: 'Print',
                    icon: 'print',
                    onSelect: () => useStore.setState({ printMessageId: m.id, printThreadId: null }),
                  },
                  {
                    label: 'Download message (.eml)',
                    icon: 'download',
                    disabled: !source,
                    onSelect: () => source && downloadEml(m, source).catch((e: Error) => showToast(e.message)),
                  },
                  { label: 'Show original', icon: 'code', onSelect: () => useStore.setState({ originalMessageId: m.id }) },
                  'divider',
                  { label: 'Mark unread from here', icon: 'mark_email_unread', onSelect: () => markUnreadFrom(m.id) },
                ]}
              />
            </div>
          </div>
          <div className="mt-3 pr-2">
            <MessageBody meta={m} source={source} />
          </div>
        </div>
      </div>
    </article>
  );
}

function markUnreadFrom(messageId: string) {
  const s = useStore.getState();
  const tid = s.msgToThread.get(messageId);
  const t = tid ? s.threads.get(tid) : undefined;
  if (!t) return;
  const ids = t.messageIds.slice(t.messageIds.indexOf(messageId));
  s.setFlags(ids, { unread: true });
  location.hash = viewToHash(s.route.view);
}

/** Initial expansion: unread messages and the latest one, like Gmail. */
function initialExpanded(msgs: MessageMeta[]): Set<string> {
  const set = new Set<string>();
  msgs.forEach((m, i) => {
    if (m.unread || i === msgs.length - 1) set.add(m.id);
  });
  return set;
}

export function ThreadView({ threadId, split }: { threadId: string; split: boolean }) {
  const thread = useStore((s) => s.threads.get(threadId));
  const messages = useStore((s) => s.messages);
  const view = useStore((s) => s.route.view);
  const listIds = useStore((s) => s.list.ids);
  const { setThreadsRead, setThreadsStarred } = useStore.getState();
  const msgs = useMemo(() => (thread ? thread.messageIds.map((id) => messages.get(id)!).filter(Boolean) : []), [thread, messages]);
  const [expanded, setExpanded] = useState<Set<string>>(() => initialExpanded(msgs));
  const [showCollapsed, setShowCollapsed] = useState(false);
  const [replay, setReplay] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // Reset when switching threads; mark the conversation read when opened.
  useEffect(() => {
    setExpanded(initialExpanded(msgs));
    setShowCollapsed(false);
    setReplay(false);
    scroller.current?.scrollTo({ top: 0 });
    if (thread?.unread) setThreadsRead([threadId], true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    // The replay timeline handles n / p itself.
    if (replay) return;
    const onKey = (e: Event) => {
      const dir = (e as CustomEvent<number>).detail;
      // n / p: move expansion to next/previous message.
      const ids = msgs.map((m) => m.id);
      const lastOpen = [...expanded].map((id) => ids.indexOf(id)).sort((a, b) => b - a)[0] ?? ids.length - 1;
      const next = Math.min(ids.length - 1, Math.max(0, lastOpen + dir));
      setExpanded((s) => new Set(s).add(ids[next]));
      setShowCollapsed(true);
      setTimeout(() => scroller.current?.querySelectorAll('article, [role=button]')[next]?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
    };
    window.addEventListener('mv:message-nav', onKey);
    return () => window.removeEventListener('mv:message-nav', onKey);
  }, [msgs, expanded, replay]);

  // Thread ids for non-Gmail mail can change when an import adds an earlier message;
  // follow a message we were showing to its new thread instead of dead-ending.
  const anchor = useRef<string | null>(null);
  if (thread) anchor.current = thread.messageIds[0];
  const movedTo = useStore((s) => (!thread && anchor.current ? s.msgToThread.get(anchor.current) : undefined));
  useEffect(() => {
    if (!movedTo || movedTo === threadId) return;
    history.replaceState(null, '', viewToHash(view) + '/' + movedTo);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, [movedTo, threadId, view]);

  if (!thread) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-ink-2">
        <p>This conversation could not be found.</p>
        <a href={viewToHash(view)} className="text-accent hover:underline">
          Back to {viewTitle(view)}
        </a>
      </div>
    );
  }

  const pos = listIds.indexOf(threadId);
  const go = (delta: number) => {
    const id = listIds[pos + delta];
    if (id) location.hash = viewToHash(view) + '/' + id;
  };
  const allExpanded = msgs.every((m) => expanded.has(m.id));
  const userLabels = [...thread.labels].filter((l) => !isSystemLabel(l));
  const systemChips = [
    thread.labels.has(L.inbox) && 'Inbox',
    thread.labels.has(L.sent) && 'Sent',
    thread.labels.has(L.spam) && 'Spam',
    thread.labels.has(L.trash) && 'Trash',
    thread.labels.has(L.drafts) && 'Drafts',
  ].filter(Boolean) as string[];

  // Collapse long runs of read messages into a "N older messages" bubble.
  const firstExpanded = msgs.findIndex((m) => expanded.has(m.id));
  const collapseFrom = 1;
  const collapseTo = firstExpanded > 0 ? firstExpanded - 1 : msgs.length - 2;
  const hideRange = !showCollapsed && collapseTo - collapseFrom + 1 >= 3;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 pr-2 pl-2">
        {!split && <IconButton icon="arrow_back" label={`Back to ${viewTitle(view)}`} onClick={() => (location.hash = viewToHash(view))} />}
        <IconButton icon="download" label="Export conversation as .mbox" onClick={() => void exportThreads([threadId], thread.subject || 'conversation')} />
        <IconButton
          icon="mark_email_unread"
          label="Mark as unread"
          onClick={() => {
            setThreadsRead([threadId], false);
            location.hash = viewToHash(view);
          }}
        />
        <IconButton
          icon="star"
          filled={thread.starred}
          iconClassName={thread.starred ? 'text-star' : ''}
          label={thread.starred ? 'Remove star' : 'Add star'}
          onClick={() => setThreadsStarred([threadId], !thread.starred)}
        />
        <IconButton icon="print" label="Print all" onClick={() => useStore.setState({ printThreadId: threadId, printMessageId: null })} />
        {!replay && (
          <IconButton
            icon={allExpanded ? 'unfold_less' : 'unfold_more'}
            label={allExpanded ? 'Collapse all' : 'Expand all'}
            onClick={() => {
              setShowCollapsed(true);
              setExpanded(allExpanded ? new Set([msgs[msgs.length - 1].id]) : new Set(msgs.map((m) => m.id)));
            }}
          />
        )}
        {msgs.length > 1 && (
          <IconButton
            icon="timeline"
            label={replay ? 'Back to conversation' : 'Replay conversation as a timeline'}
            aria-pressed={replay}
            className={replay ? 'bg-accent-soft' : ''}
            onClick={() => {
              setReplay((r) => !r);
              scroller.current?.scrollTo({ top: 0 });
            }}
          />
        )}
        {pos >= 0 && (
          <div className="ml-auto flex items-center text-xs text-ink-2">
            <span className="mr-1 hidden whitespace-nowrap sm:inline">
              {(pos + 1).toLocaleString()} of {listIds.length.toLocaleString()}
            </span>
            <IconButton icon="chevron_left" label="Newer" disabled={pos <= 0} onClick={() => go(-1)} />
            <IconButton icon="chevron_right" label="Older" disabled={pos >= listIds.length - 1} onClick={() => go(1)} />
          </div>
        )}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto pb-16">
        <div className="flex items-start gap-3 pt-3 pr-4 pb-4 pl-[72px] max-sm:pl-4">
          <h1 className="min-w-0 flex-1 font-display text-[22px] leading-7 break-words text-ink">
            {thread.subject || '(no subject)'}
            <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
              {systemChips.map((c) => (
                <span key={c} className="rounded bg-chip px-1.5 text-xs leading-5 text-chip-ink">
                  {c}
                </span>
              ))}
              {userLabels.map((l) => (
                <LabelChip key={l} label={l} onClick={() => (location.hash = '#label/' + encodeURIComponent(l))} />
              ))}
            </span>
          </h1>
        </div>

        {replay && <ReplayTimeline msgs={msgs} />}

        {!replay && msgs.map((m, i) => {
          if (hideRange && i >= collapseFrom && i <= collapseTo) {
            if (i !== collapseFrom) return null;
            return (
              <div key="collapsed" className="relative my-1 flex h-6 items-center">
                <div className="absolute inset-x-0 top-1/2 border-t border-line" />
                <div className="absolute inset-x-0 top-1/2 mt-1 border-t border-line" />
                <button
                  type="button"
                  onClick={() => setShowCollapsed(true)}
                  className="relative ml-4 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-sm font-medium text-ink-2 hover:bg-hover"
                  title={`${collapseTo - collapseFrom + 1} older messages`}
                  aria-label={`Show ${collapseTo - collapseFrom + 1} older messages`}
                >
                  {collapseTo - collapseFrom + 1}
                </button>
              </div>
            );
          }
          return (
            <MessageItem
              key={m.id}
              m={m}
              isLast={i === msgs.length - 1}
              expanded={expanded.has(m.id)}
              onToggle={() =>
                setExpanded((s) => {
                  const n = new Set(s);
                  if (n.has(m.id)) n.delete(m.id);
                  else n.add(m.id);
                  return n;
                })
              }
            />
          );
        })}
      </div>
    </div>
  );
}
