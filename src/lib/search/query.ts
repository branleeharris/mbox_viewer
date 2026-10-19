/**
 * Gmail search syntax: from: to: cc: bcc: subject: label: in: is: has: filename:
 * before: after: older_than: newer_than: larger: smaller: category: list:
 * plus "quoted phrases", -negation, OR, parentheses and {a b} groups.
 */
import type { MessageMeta } from '../types';
import { L, categoryLabel, effectiveLabels, isSystemLabel, type CategoryId } from '../labels';

export type Node =
  | { type: 'and'; children: Node[] }
  | { type: 'or'; children: Node[] }
  | { type: 'not'; child: Node }
  | { type: 'term'; field: string | null; value: string };

const FIELDS = new Set([
  'from', 'to', 'cc', 'bcc', 'subject', 'label', 'in', 'is', 'has', 'filename',
  'before', 'after', 'older', 'newer', 'older_than', 'newer_than', 'larger', 'smaller',
  'size', 'category', 'list', 'deliveredto', 'rfc822msgid',
]);

type Tok = { k: 'word'; field: string | null; value: string; neg: boolean } | { k: '(' | ')' | '{' | '}' | 'OR'; neg: boolean };

function tokenize(q: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    let neg = false;
    if (c === '-' && i + 1 < q.length && !/\s/.test(q[i + 1])) {
      neg = true;
      i++;
    }
    const ch = q[i];
    if (ch === '(' || ch === ')' || ch === '{' || ch === '}') {
      toks.push({ k: ch, neg });
      i++;
      continue;
    }
    let field: string | null = null;
    const fm = /^([a-z_0-9]+):/i.exec(q.slice(i));
    if (fm && FIELDS.has(fm[1].toLowerCase())) {
      field = fm[1].toLowerCase();
      i += fm[0].length;
    }
    let value = '';
    if (q[i] === '"') {
      const end = q.indexOf('"', i + 1);
      value = q.slice(i + 1, end < 0 ? q.length : end);
      i = end < 0 ? q.length : end + 1;
    } else if (field && q[i] === '(') {
      // from:(a b) — treat the group as one value list.
      const end = q.indexOf(')', i + 1);
      value = q.slice(i + 1, end < 0 ? q.length : end);
      i = end < 0 ? q.length : end + 1;
    } else {
      const m = /^[^\s(){}"]+/.exec(q.slice(i));
      value = m ? m[0] : '';
      i += value.length;
      if (!value && !field) {
        i++;
        continue;
      }
    }
    if (!field && !neg && (value === 'OR' || value === '|')) {
      toks.push({ k: 'OR', neg: false });
      continue;
    }
    if (!field && value === 'AND') continue;
    toks.push({ k: 'word', field, value, neg });
  }
  return toks;
}

export function parseQuery(q: string): Node {
  const toks = tokenize(q);
  let pos = 0;

  function parseSeq(closer: ')' | '}' | null): Node {
    const items: Node[] = [];
    let pendingOr: Node[] | null = null;
    while (pos < toks.length) {
      const t = toks[pos];
      if (t.k === ')' || t.k === '}') {
        // Consume the closer; a stray one at top level just ends the sequence.
        pos++;
        if (closer) break;
        continue;
      }
      if (t.k === 'OR') {
        pos++;
        const last = items.pop();
        if (last) pendingOr = pendingOr ? [...pendingOr] : [last];
        continue;
      }
      let node: Node;
      pos++;
      if (t.k === '(') node = parseSeq(')');
      else if (t.k === '{') {
        const inner = parseSeq('}');
        node = inner.type === 'and' ? { type: 'or', children: inner.children } : inner;
      } else if (t.k === 'word') {
        node = termNode(t.field, t.value);
      } else {
        continue;
      }
      if (t.neg) node = { type: 'not', child: node };
      if (pendingOr) {
        pendingOr.push(node);
        items.push({ type: 'or', children: pendingOr });
        pendingOr = null;
      } else {
        items.push(node);
      }
    }
    if (pendingOr) items.push(...pendingOr);
    return items.length === 1 ? items[0] : { type: 'and', children: items };
  }

  return parseSeq(null);
}

function termNode(field: string | null, value: string): Node {
  // from:(alice bob) means from alice AND from bob in Gmail; keep it simple: any of them.
  if (field && /\s/.test(value.trim()) && ['from', 'to', 'cc', 'bcc', 'label', 'filename'].includes(field)) {
    return { type: 'or', children: value.trim().split(/\s+/).map((v) => ({ type: 'term', field, value: v })) };
  }
  return { type: 'term', field, value };
}

/** Free-text terms the full-text index must resolve. */
export function textTerms(node: Node): string[] {
  const out = new Set<string>();
  const walk = (n: Node) => {
    if (n.type === 'term') {
      if (!n.field && n.value) out.add(n.value.toLowerCase());
    } else if (n.type === 'not') walk(n.child);
    else n.children.forEach(walk);
  };
  walk(node);
  return [...out];
}

/** Positive words to highlight in results. */
export function highlightTerms(node: Node): string[] {
  const out = new Set<string>();
  const walk = (n: Node, neg: boolean) => {
    if (n.type === 'term') {
      if (!neg && n.value && (!n.field || n.field === 'subject')) out.add(n.value);
    } else if (n.type === 'not') walk(n.child, !neg);
    else n.children.forEach((c) => walk(c, neg));
  };
  walk(node, false);
  return [...out].filter((t) => t.length > 1);
}

function parseDateValue(v: string): number | null {
  let m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(v);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  if (m) return new Date(+m[3], +m[1] - 1, +m[2]).getTime();
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

function parseRelative(v: string): number | null {
  const m = /^(\d+)([dmy])$/i.exec(v);
  if (!m) return null;
  const n = +m[1];
  const d = new Date();
  if (m[2].toLowerCase() === 'd') d.setDate(d.getDate() - n);
  else if (m[2].toLowerCase() === 'm') d.setMonth(d.getMonth() - n);
  else d.setFullYear(d.getFullYear() - n);
  return d.getTime();
}

function parseSize(v: string): number | null {
  const m = /^(\d+(?:\.\d+)?)([kmg]b?|b)?$/i.exec(v);
  if (!m) return null;
  const unit = (m[2] ?? '').toLowerCase()[0];
  const mult = unit === 'k' ? 1024 : unit === 'm' ? 1024 ** 2 : unit === 'g' ? 1024 ** 3 : 1;
  return +m[1] * mult;
}

const norm = (s: string) => s.toLowerCase().replace(/[-_/\s]+/g, ' ').trim();

function addrMatch(list: { name: string; address: string }[], value: string, me: string[]): boolean {
  const v = value.toLowerCase();
  if (v === 'me') return list.some((a) => me.includes(a.address));
  return list.some((a) => a.address.includes(v) || a.name.toLowerCase().includes(v));
}

export interface EvalContext {
  /** term -> ids of messages whose text contains it */
  text: Map<string, Set<string>>;
  me: string[];
}

export function matchMessage(node: Node, m: MessageMeta, ctx: EvalContext): boolean {
  switch (node.type) {
    case 'and':
      return node.children.every((c) => matchMessage(c, m, ctx));
    case 'or':
      return node.children.some((c) => matchMessage(c, m, ctx));
    case 'not':
      return !matchMessage(node.child, m, ctx);
    case 'term':
      return matchTerm(node.field, node.value, m, ctx);
  }
}

function matchTerm(field: string | null, value: string, m: MessageMeta, ctx: EvalContext): boolean {
  const v = value.toLowerCase();
  if (!v) return true;
  switch (field) {
    case null:
      return ctx.text.get(v)?.has(m.id) ?? false;
    case 'from':
      return addrMatch([m.from], v, ctx.me);
    case 'to':
      return addrMatch(m.to, v, ctx.me);
    case 'cc':
      return addrMatch(m.cc, v, ctx.me);
    case 'bcc':
      return addrMatch(m.bcc, v, ctx.me);
    case 'deliveredto':
      return (m.deliveredTo ?? '').includes(v);
    case 'subject':
      return m.subject.toLowerCase().includes(v);
    case 'rfc822msgid':
      return m.messageId === v.replace(/^<|>$/g, '');
    case 'filename':
      return m.attachments.some((a) => a.name.toLowerCase().includes(v) || a.type.includes(v));
    case 'label': {
      const n = norm(v);
      return m.labels.some((l) => !isSystemLabel(l) && (norm(l) === n || norm(l).startsWith(n + ' ')));
    }
    case 'category':
      return m.labels.includes(categoryLabel(v as CategoryId)) ||
        (v === 'primary' && effectiveLabels(m, ctx.me).includes(L.inbox) && !m.labels.some((l) => l.startsWith('\\Category ') && l !== categoryLabel('primary')));
    case 'in':
      return inFolder(v, m, ctx.me);
    case 'is':
      if (v === 'unread') return m.unread;
      if (v === 'read') return !m.unread;
      if (v === 'starred') return m.starred;
      if (v === 'important') return m.important;
      return inFolder(v, m, ctx.me);
    case 'has':
      if (v === 'attachment') return m.attachments.length > 0;
      if (v === 'userlabels') return m.labels.some((l) => !isSystemLabel(l));
      if (v === 'nouserlabels') return !m.labels.some((l) => !isSystemLabel(l));
      if (v === 'pdf') return m.attachments.some((a) => a.type === 'application/pdf');
      if (v === 'image') return m.attachments.some((a) => a.type.startsWith('image/'));
      return false;
    case 'before':
    case 'older': {
      const t = parseDateValue(v);
      return t != null && m.date > 0 && m.date < t;
    }
    case 'after':
    case 'newer': {
      const t = parseDateValue(v);
      return t != null && m.date >= t;
    }
    case 'older_than': {
      const t = parseRelative(v);
      return t != null && m.date > 0 && m.date < t;
    }
    case 'newer_than': {
      const t = parseRelative(v);
      return t != null && m.date >= t;
    }
    case 'larger':
    case 'size': {
      const s = parseSize(v);
      return s != null && m.length >= s;
    }
    case 'smaller': {
      const s = parseSize(v);
      return s != null && m.length < s;
    }
    case 'list':
      return m.to.some((a) => a.address.includes(v)) || m.cc.some((a) => a.address.includes(v));
    default:
      return false;
  }
}

function inFolder(v: string, m: MessageMeta, me: string[]): boolean {
  const labels = effectiveLabels(m, me);
  switch (v) {
    case 'anywhere':
      return true;
    case 'inbox':
      return labels.includes(L.inbox);
    case 'sent':
      return labels.includes(L.sent);
    case 'draft':
    case 'drafts':
      return labels.includes(L.drafts);
    case 'spam':
      return labels.includes(L.spam);
    case 'trash':
      return labels.includes(L.trash);
    case 'chats':
    case 'chat':
      return labels.includes(L.chats);
    case 'starred':
      return m.starred;
    case 'important':
      return m.important;
    case 'unread':
      return m.unread;
    default:
      return labels.some((l) => norm(l) === norm(v));
  }
}

/** True when the query restricts location itself (so search shouldn't hide spam/trash). */
export function mentionsLocation(node: Node, negated = false): boolean {
  if (node.type === 'term') {
    if (negated) return false;
    const v = node.value.toLowerCase();
    return node.field === 'in' || (node.field === 'is' && (v === 'spam' || v === 'trash'));
  }
  if (node.type === 'not') return mentionsLocation(node.child, !negated);
  return node.children.some((c) => mentionsLocation(c, negated));
}
