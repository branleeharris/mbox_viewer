import { memo } from 'react';
import { useStore } from '../store';
import type { MessageMeta, Thread } from '../lib/types';
import { displayName, listDate, fullDate } from '../lib/format';
import { isSystemLabel, L } from '../lib/labels';
import { Icon } from './Icon';
import { Checkbox, IconButton, LabelChip } from './ui';

interface Sender {
  key: string;
  name: string;
  unread: boolean;
  draft: boolean;
}

function senders(thread: Thread, messages: Map<string, MessageMeta>, me: string[]): Sender[] {
  const out: Sender[] = [];
  const seen = new Map<string, Sender>();
  const multi = new Set(thread.messageIds.map((id) => messages.get(id)?.from.address)).size > 1;
  for (const id of thread.messageIds) {
    const m = messages.get(id);
    if (!m) continue;
    const draft = m.labels.includes(L.drafts);
    const key = draft ? '\\draft' : m.from.address || m.from.name;
    const existing = seen.get(key);
    if (existing) {
      existing.unread ||= m.unread;
      // Gmail lists each sender at their latest position.
      out.splice(out.indexOf(existing), 1);
      out.push(existing);
      continue;
    }
    const s: Sender = { key, name: draft ? 'Draft' : displayName(m.from, me, multi), unread: m.unread, draft };
    seen.set(key, s);
    out.push(s);
  }
  return out;
}

function SenderList({ thread, bold }: { thread: Thread; bold: boolean }) {
  const messages = useStore((s) => s.messages);
  const me = useStore((s) => s.settings.meAddresses);
  const route = useStore((s) => s.route.view);
  // In Sent, Gmail shows recipients ("To: Alice, Bob").
  if (route.kind === 'folder' && route.folder === 'sent') {
    const last = messages.get(thread.messageIds[thread.messageIds.length - 1]);
    const to = last ? [...last.to, ...last.cc].slice(0, 3).map((a) => displayName(a, me, true)).join(', ') : '';
    return <span className="truncate">To: {to || '(no recipients)'}</span>;
  }
  let list = senders(thread, messages, me);
  let gap = false;
  if (list.length > 3) {
    list = [list[0], ...list.slice(-2)];
    gap = true;
  }
  const count = thread.messageIds.length;
  return (
    <span className="truncate">
      {list.map((s, i) => (
        <span key={s.key}>
          {i > 0 && (gap && i === 1 ? <span className="text-ink-3"> .. </span> : ', ')}
          <span className={`${s.unread || bold ? 'font-bold' : ''} ${s.draft ? 'text-danger' : ''}`}>{s.name}</span>
        </span>
      ))}
      {count > 1 && <span className="ml-1 text-xs font-normal text-ink-3">{count}</span>}
    </span>
  );
}

function AttachmentChips({ thread }: { thread: Thread }) {
  const messages = useStore((s) => s.messages);
  const atts = thread.messageIds.flatMap((id) => messages.get(id)?.attachments ?? []);
  if (!atts.length) return null;
  const shown = atts.slice(0, 3);
  return (
    <div className="mt-1 flex gap-2 overflow-hidden">
      {shown.map((a, i) => (
        <span key={i} className="flex h-6 max-w-44 items-center gap-1.5 rounded-full border border-line px-2 text-xs text-ink-2">
          <Icon
            size={16}
            name={a.type === 'application/pdf' ? 'picture_as_pdf' : a.type.startsWith('image/') ? 'image' : /zip|compressed/.test(a.type) ? 'folder_zip' : 'description'}
            className={a.type === 'application/pdf' ? 'text-[#d93025]' : a.type.startsWith('image/') ? 'text-[#d93025]' : 'text-[#1a73e8]'}
          />
          <span className="truncate">{a.name}</span>
        </span>
      ))}
      {atts.length > 3 && <span className="flex h-6 items-center rounded-full border border-line px-2 text-xs text-ink-2">+{atts.length - 3}</span>}
    </div>
  );
}

interface RowProps {
  thread: Thread;
  index: number;
  selected: boolean;
  focused: boolean;
  open: boolean;
  split: boolean;
  onOpen: (id: string) => void;
  onSelect: (index: number, checked: boolean, shift: boolean) => void;
}

export const MailRow = memo(function MailRow({ thread, index, selected, focused, open, split, onOpen, onSelect }: RowProps) {
  const density = useStore((s) => s.settings.density);
  const view = useStore((s) => s.route.view);
  const last = useStore((s) => s.messages.get(thread.messageIds[thread.messageIds.length - 1]));
  const { setThreadsRead, setThreadsStarred, setThreadsImportant } = useStore.getState();
  const unread = thread.unread;

  const userLabels = [...thread.labels].filter(
    (l) => !isSystemLabel(l) && !(view.kind === 'label' && view.label === l),
  );
  const inboxChip = view.kind === 'search' && thread.labels.has(L.inbox);
  const snippet = last?.snippet ?? '';
  const bg = selected ? 'bg-row-selected' : open ? 'bg-accent-soft/40' : unread ? 'bg-row-unread' : 'bg-row-read';

  const actions = (
    <div className="hidden items-center group-hover:flex">
      <IconButton
        dense
        icon={unread ? 'mark_email_read' : 'mark_email_unread'}
        label={unread ? 'Mark as read' : 'Mark as unread'}
        onClick={(e) => {
          e.stopPropagation();
          setThreadsRead([thread.id], unread);
        }}
      />
      <IconButton
        dense
        icon="label_important"
        filled={thread.important}
        label={thread.important ? 'Mark as not important' : 'Mark as important'}
        onClick={(e) => {
          e.stopPropagation();
          setThreadsImportant([thread.id], !thread.important);
        }}
      />
    </div>
  );

  const star = (
    <IconButton
      dense
      icon="star"
      filled={thread.starred}
      label={thread.starred ? 'Starred' : 'Not starred'}
      iconClassName={thread.starred ? 'text-star' : 'text-ink-3'}
      onClick={(e) => {
        e.stopPropagation();
        setThreadsStarred([thread.id], !thread.starred);
      }}
    />
  );

  if (split) {
    return (
      <div
        role="row"
        aria-selected={selected}
        onClick={() => onOpen(thread.id)}
        className={`row-hover group flex cursor-pointer gap-1 border-b border-line py-2 pr-4 pl-1 ${bg} ${focused ? 'shadow-[inset_3px_0_0_var(--accent)]' : ''}`}
      >
        <div className="flex flex-col items-center">
          <Checkbox checked={selected} label="Select" onChange={(c, e) => onSelect(index, c, e.shiftKey)} />
          {star}
        </div>
        <div className={`min-w-0 flex-1 pt-1.5 ${unread ? 'text-ink' : 'text-ink-2'}`}>
          <div className="flex items-baseline gap-2">
            <div className="min-w-0 flex-1 truncate">
              <SenderList thread={thread} bold={unread} />
            </div>
            <span className={`shrink-0 text-xs ${unread ? 'font-bold text-ink' : 'text-ink-3'}`} title={fullDate(thread.lastDate)}>
              {listDate(thread.lastDate)}
            </span>
          </div>
          <div className={`truncate ${unread ? 'font-bold' : ''}`}>{thread.subject || '(no subject)'}</div>
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1 truncate text-ink-3">{snippet}</div>
            {thread.hasAttachments && <Icon name="attach_file" size={16} className="text-ink-3" />}
          </div>
        </div>
      </div>
    );
  }

  const h = density === 'compact' ? 'min-h-8' : 'min-h-10';
  return (
    <div
      role="row"
      aria-selected={selected}
      onClick={() => onOpen(thread.id)}
      className={`row-hover group flex cursor-pointer items-start border-b border-line pr-4 pl-2 text-sm ${h} ${bg} ${focused ? 'shadow-[inset_3px_0_0_var(--accent)]' : ''} ${unread ? 'text-ink' : 'text-ink-2'}`}
    >
      <div className={`flex shrink-0 items-center ${density === 'compact' ? 'h-8' : 'h-10'}`}>
        <Checkbox checked={selected} label="Select" onChange={(c, e) => onSelect(index, c, e.shiftKey)} />
        {star}
        <span className="hidden md:inline-flex">
          <IconButton
            dense
            icon="label_important"
            filled={thread.important}
            label={thread.important ? 'Important' : 'Not important'}
            iconClassName={thread.important ? 'text-important' : 'text-ink-3'}
            onClick={(e) => {
              e.stopPropagation();
              setThreadsImportant([thread.id], !thread.important);
            }}
          />
        </span>
      </div>
      <div className={`flex min-w-0 flex-1 flex-col justify-center ${density === 'compact' ? 'min-h-8' : 'min-h-10'}`}>
        <div className={`flex min-w-0 items-center ${density === 'compact' ? 'h-8' : 'h-10'}`}>
          <div className="w-[120px] shrink-0 truncate pr-4 md:w-[168px] lg:w-[200px]">
            <SenderList thread={thread} bold={false} />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {inboxChip && <LabelChip label="Inbox" />}
            {userLabels.slice(0, 3).map((l) => (
              <LabelChip key={l} label={l} onClick={() => (location.hash = '#label/' + encodeURIComponent(l))} />
            ))}
            <span className="truncate">
              <span className={unread ? 'font-bold' : ''}>{thread.subject || '(no subject)'}</span>
              {snippet && <span className="text-ink-3"> - {snippet}</span>}
            </span>
          </div>
          <div className="ml-3 flex shrink-0 items-center justify-end gap-1">
            {thread.hasAttachments && density !== 'default' && <Icon name="attach_file" size={16} className="text-ink-3 group-hover:hidden" />}
            <span
              className={`w-16 text-right text-xs group-hover:hidden ${unread ? 'font-bold text-ink' : 'text-ink-3'}`}
              title={fullDate(thread.lastDate)}
            >
              {listDate(thread.lastDate)}
            </span>
            {actions}
          </div>
        </div>
        {density === 'default' && thread.hasAttachments && (
          <div className="-mt-1.5 mb-2 pl-[120px] md:pl-[168px] lg:pl-[200px]">
            <AttachmentChips thread={thread} />
          </div>
        )}
      </div>
    </div>
  );
});
