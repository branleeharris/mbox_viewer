import PostalMime, { decodeWords } from 'postal-mime';
import type { Address, Email } from 'postal-mime';
import type { Addr, AttachmentMeta, MessageMeta } from '../types';
import { L, canonicalLabel, splitLabelHeader } from '../labels';
import { makeSnippet } from '../quotes';
import { htmlToText } from '../htmlText';
import { separatorLength, separatorLine, toRfc822 } from './splitter';

/** Max characters of body text kept per message for full-text search. */
const SEARCH_TEXT_LIMIT = 40_000;

export function flattenAddresses(list: Address[] | Address | undefined): Addr[] {
  if (!list) return [];
  const arr = Array.isArray(list) ? list : [list];
  const out: Addr[] = [];
  for (const a of arr) {
    if (a.group) for (const m of a.group) out.push({ name: m.name || '', address: (m.address || '').toLowerCase() });
    else out.push({ name: a.name || '', address: (a.address || '').toLowerCase() });
  }
  return out.filter((a) => a.name || a.address);
}

function stripBrackets(id: string | undefined): string {
  if (!id) return '';
  const m = /<([^>]+)>/.exec(id);
  return (m ? m[1] : id).trim().toLowerCase();
}

function parseReferences(refs: string | undefined): string[] {
  if (!refs) return [];
  const out: string[] = [];
  const re = /<([^>]+)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(refs))) out.push(m[1].trim().toLowerCase());
  return out;
}

function header(email: Email, key: string): string | undefined {
  const h = email.headers.find((x) => x.key === key);
  return h?.value;
}

function parseDate(email: Email, sepLine: string): number {
  if (email.date) {
    const t = Date.parse(email.date);
    if (!Number.isNaN(t)) return t;
  }
  const received = header(email, 'received');
  if (received) {
    const t = Date.parse(received.slice(received.lastIndexOf(';') + 1).trim());
    if (!Number.isNaN(t)) return t;
  }
  // `From sender Mon Jan  1 00:00:00 +0000 2024`
  const m = /^From \S+\s+(.+)$/.exec(sepLine);
  if (m) {
    const t = Date.parse(m[1]);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

export interface Extracted {
  meta: Omit<MessageMeta, 'id' | 'sourceId' | 'offset'>;
  searchText: string;
}

/** Parse one message (bytes include the mbox separator line) into list metadata. */
export async function extractMessage(bytes: Uint8Array): Promise<Extracted> {
  const rfc822 = toRfc822(bytes);
  const sepLine = separatorLine(bytes);
  const email = await PostalMime.parse(rfc822, { attachmentEncoding: 'arraybuffer', maxNestingDepth: 64 });

  const labels = new Set<string>();
  const gmLabels = header(email, 'x-gmail-labels');
  if (gmLabels) {
    for (const raw of splitLabelHeader(decodeHeaderWords(gmLabels))) {
      const c = canonicalLabel(raw);
      if (c) labels.add(c);
    }
  }
  const folder = header(email, 'x-folder') ?? header(email, 'x-mozilla-folder');
  if (folder) {
    const c = canonicalLabel(folder);
    if (c) labels.add(c);
  }

  // Read state: Gmail labels first, then classic mbox Status/X-Status flags.
  const status = (header(email, 'status') ?? '') + (header(email, 'x-status') ?? '');
  let unread = false;
  if (labels.has(L.unread)) unread = true;
  else if (!labels.has(L.opened) && !gmLabels && status) unread = !/R/.test(status);
  const starred = labels.has(L.starred) || /F/.test(header(email, 'x-status') ?? '');
  const important = labels.has(L.important);
  for (const transient of [L.unread, L.opened, L.archived, L.starred, L.important]) labels.delete(transient);
  // Exports without any folder info (Vault, most non-Gmail clients): the app files
  // these by sender once it knows the owner's address (see effectiveLabels).
  const folderless = !gmLabels && labels.size === 0;
  if (folderless) labels.add(L.inbox);

  const attachments: AttachmentMeta[] = [];
  for (const a of email.attachments) {
    if (a.related) continue; // inline images referenced from the HTML body
    const size = typeof a.content === 'string' ? a.content.length : a.content.byteLength;
    attachments.push({ name: a.filename || unnamed(a.mimeType), type: a.mimeType, size });
  }

  // Some senders put raw HTML in the text/plain part; treat that as HTML.
  const plain = email.text?.trim() ? email.text : '';
  const plainIsHtml = !!plain && /<(br|p|div|tr|td|table|span|font|a)\b[^>]*>/i.test(plain);
  const text = plain && !plainIsHtml ? plain : email.html ? htmlToText(email.html) : plainIsHtml ? htmlToText(plain) : '';
  const from = flattenAddresses(email.from)[0] ?? { name: '', address: '' };
  const to = flattenAddresses(email.to);
  const cc = flattenAddresses(email.cc);
  const bcc = flattenAddresses(email.bcc);
  const subject = (email.subject ?? '').replace(/\s+/g, ' ').trim();
  const messageId = stripBrackets(email.messageId);
  const date = parseDate(email, sepLine);

  const searchText = [
    subject,
    ...[from, ...to, ...cc, ...bcc].map((a) => `${a.name} ${a.address}`),
    attachments.map((a) => a.name).join(' '),
    text.length > SEARCH_TEXT_LIMIT ? text.slice(0, SEARCH_TEXT_LIMIT) : text,
  ]
    .join('\n')
    .toLowerCase();

  const thrid = header(email, 'x-gm-thrid')?.trim();

  return {
    meta: {
      headerOffset: separatorLength(bytes),
      length: bytes.length,
      messageId,
      dedupeKey: messageId ? `${messageId}|${date}` : `${date}|${from.address}|${subject}|${bytes.length}`,
      gmThreadId: thrid || undefined,
      inReplyTo: stripBrackets(email.inReplyTo) || undefined,
      references: parseReferences(email.references),
      from,
      to,
      cc,
      bcc,
      replyTo: flattenAddresses(email.replyTo),
      deliveredTo: email.deliveredTo?.toLowerCase(),
      subject,
      date,
      snippet: makeSnippet(text),
      labels: [...labels],
      ...(folderless ? { folderless: true } : {}),
      attachments,
      unread,
      starred,
      important,
    },
    searchText,
  };
}

function unnamed(mime: string): string {
  if (mime === 'message/rfc822') return 'forwarded-message.eml';
  if (mime === 'text/calendar') return 'invite.ics';
  const ext = mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
  return `attachment.${ext}`;
}

/** Decode RFC 2047 encoded words that postal-mime leaves in non-standard headers. */
function decodeHeaderWords(value: string): string {
  try {
    return decodeWords(value);
  } catch {
    return value;
  }
}
