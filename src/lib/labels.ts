/**
 * Gmail label handling. Google Takeout writes every message's labels into an
 * `X-Gmail-Labels` header, e.g. `Inbox,Important,Opened,Category Updates,Work/Clients`.
 */

import type { MessageMeta } from './types';

/** System folders, in sidebar order. `id` is used in URLs. */
export const SYSTEM_FOLDERS = [
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'starred', label: 'Starred', icon: 'star' },
  { id: 'important', label: 'Important', icon: 'label_important' },
  { id: 'sent', label: 'Sent', icon: 'send' },
  { id: 'drafts', label: 'Drafts', icon: 'draft' },
  { id: 'chats', label: 'Chats', icon: 'chat_bubble' },
  { id: 'all', label: 'All Mail', icon: 'stacks' },
  { id: 'spam', label: 'Spam', icon: 'report' },
  { id: 'trash', label: 'Trash', icon: 'delete' },
] as const;

export type FolderId = (typeof SYSTEM_FOLDERS)[number]['id'];

export const CATEGORIES = [
  { id: 'primary', label: 'Primary', icon: 'inbox', archiveLabel: 'Category Personal' },
  { id: 'promotions', label: 'Promotions', icon: 'sell', archiveLabel: 'Category Promotions' },
  { id: 'social', label: 'Social', icon: 'group', archiveLabel: 'Category Social' },
  { id: 'updates', label: 'Updates', icon: 'info', archiveLabel: 'Category Updates' },
  { id: 'forums', label: 'Forums', icon: 'forum', archiveLabel: 'Category Forums' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

/** Canonical internal names for labels with special meaning. */
export const L = {
  inbox: '\\Inbox',
  sent: '\\Sent',
  drafts: '\\Drafts',
  spam: '\\Spam',
  trash: '\\Trash',
  chats: '\\Chat',
  starred: '\\Starred',
  important: '\\Important',
  unread: '\\Unread',
  opened: '\\Opened',
  archived: '\\Archived',
} as const;

const SYSTEM_MAP: Record<string, string> = {
  inbox: L.inbox,
  sent: L.sent,
  'sent mail': L.sent,
  'sent messages': L.sent,
  'sent items': L.sent,
  draft: L.drafts,
  drafts: L.drafts,
  spam: L.spam,
  junk: L.spam,
  'junk e-mail': L.spam,
  trash: L.trash,
  bin: L.trash,
  'deleted items': L.trash,
  'deleted messages': L.trash,
  chat: L.chats,
  chats: L.chats,
  starred: L.starred,
  important: L.important,
  unread: L.unread,
  opened: L.opened,
  archived: L.archived,
};

/** Category labels keep their Takeout spelling, prefixed so they don't show as user labels. */
const CATEGORY_PREFIX = '\\Category ';

export function categoryLabel(id: CategoryId): string {
  return CATEGORY_PREFIX + id;
}

/** Split an X-Gmail-Labels value, respecting quoted labels that contain commas. */
export function splitLabelHeader(value: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '"') {
      quoted = !quoted;
    } else if (c === '\\' && quoted && i + 1 < value.length) {
      cur += value[++i];
    } else if (c === ',' && !quoted) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Map a label from the archive onto our canonical names. Returns null for labels to drop. */
export function canonicalLabel(raw: string): string | null {
  const name = raw.trim();
  if (!name) return null;
  const lower = name.toLowerCase();
  if (SYSTEM_MAP[lower]) return SYSTEM_MAP[lower];
  // Gmail's own IMAP bookkeeping labels.
  if (/^(imap_|\[imap\]|\$)/i.test(name)) return null;
  const cat = /^category\s+(\w+)$/i.exec(name);
  if (cat) {
    const c = cat[1].toLowerCase();
    const id = c === 'personal' ? 'primary' : c;
    return CATEGORY_PREFIX + id;
  }
  return name;
}

export function isSystemLabel(label: string): boolean {
  return label.startsWith('\\');
}

/** Deterministic Gmail-style label colors (background, text). */
const LABEL_COLORS: [string, string][] = [
  ['#c2e7ff', '#004a77'],
  ['#c4eed0', '#0d652d'],
  ['#ffdfe2', '#8c1d18'],
  ['#fde293', '#594300'],
  ['#e8def8', '#4a2c7a'],
  ['#ffd8b3', '#7a3e00'],
  ['#b6ecf2', '#00474f'],
  ['#e1e3e1', '#3c4043'],
  ['#f6d1ec', '#6b1859'],
  ['#d3f0b8', '#2f5208'],
];

export function labelColor(label: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) | 0;
  const [bg, fg] = LABEL_COLORS[Math.abs(h) % LABEL_COLORS.length];
  return { bg, fg };
}

/** Last path segment of a nested label ("Work/Clients" -> "Clients"). */
export function labelLeaf(label: string): string {
  const i = label.lastIndexOf('/');
  return i >= 0 ? label.slice(i + 1) : label;
}

/**
 * Labels used for folder views. Messages with no folder info in the archive
 * (Google Vault exports, most non-Gmail clients) are filed by sender: mail from
 * the mailbox owner goes to Sent, everything else to Inbox. Messages imported
 * before the `folderless` flag existed are recognized by having only the
 * synthesized Inbox label and no Gmail thread id (Takeout always has one).
 */
export function effectiveLabels(m: Pick<MessageMeta, 'labels' | 'folderless' | 'gmThreadId' | 'from'>, me: string[]): string[] {
  const folderless = m.folderless ?? (!m.gmThreadId && m.labels.length === 1 && m.labels[0] === L.inbox);
  if (!folderless) return m.labels;
  return me.includes(m.from.address) ? [L.sent] : [L.inbox];
}
