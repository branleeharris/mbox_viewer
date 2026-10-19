import type { Addr } from './types';

export function isMe(addr: Addr | string | undefined, me: string[]): boolean {
  if (!addr) return false;
  const a = typeof addr === 'string' ? addr : addr.address;
  return !!a && me.includes(a.toLowerCase());
}

/** "Jane Doe" -> "Jane Doe"; "" + "jdoe@x.com" -> "jdoe". */
export function displayName(addr: Addr | undefined, me: string[] = [], short = false): string {
  if (!addr) return '(unknown sender)';
  if (isMe(addr, me)) return 'me';
  let name = addr.name.replace(/^["']|["']$/g, '').trim();
  if (!name) name = addr.address.split('@')[0] || addr.address || '(unknown)';
  if (short) {
    // "Doe, Jane" -> "Jane"; "Jane Doe" -> "Jane"
    const comma = /^([^,]+),\s*(\S+)/.exec(name);
    if (comma) return comma[2];
    return name.split(/\s+/)[0];
  }
  return name;
}

export function formatAddress(a: Addr): string {
  if (!a.name) return a.address;
  return a.address ? `${a.name} <${a.address}>` : a.name;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Gmail list dates: "3:45 PM" today, "Mar 4" this year, "3/4/23" otherwise. */
export function listDate(ms: number, now = new Date()): string {
  if (!ms) return '';
  const d = new Date(ms);
  if (sameDay(d, now)) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleDateString([], { year: '2-digit', month: 'numeric', day: 'numeric' });
}

export function fullDate(ms: number): string {
  if (!ms) return 'Unknown date';
  return new Date(ms).toLocaleString([], {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Thread view: "Mar 4, 2024, 3:45 PM (2 days ago)". */
export function messageDate(ms: number, now = Date.now()): string {
  if (!ms) return 'Unknown date';
  const d = new Date(ms);
  const base = d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const diff = now - ms;
  if (diff < 0) return base;
  const mins = Math.floor(diff / 60000);
  const rel =
    mins < 60
      ? `${mins} minute${mins === 1 ? '' : 's'} ago`
      : mins < 60 * 24
        ? `${Math.floor(mins / 60)} hour${Math.floor(mins / 60) === 1 ? '' : 's'} ago`
        : mins < 60 * 24 * 30
          ? `${Math.floor(mins / 1440)} day${Math.floor(mins / 1440) === 1 ? '' : 's'} ago`
          : '';
  return rel ? `${base} (${rel})` : base;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}

const AVATAR_COLORS = [
  '#e8710a', '#d93025', '#1a73e8', '#188038', '#a142f4', '#e52592',
  '#12b5cb', '#f29900', '#5f6368', '#b31412', '#1967d2', '#137333',
];

export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function initial(addr: Addr): string {
  const n = (addr.name || addr.address).replace(/^["'\s]+/, '');
  const ch = [...n][0] ?? '?';
  return ch.toUpperCase();
}

export function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 150) || 'message';
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
