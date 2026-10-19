import type { MessageMeta, Source } from './types';
import { readRfc822, isSourceAvailable, sourceBlob } from './raw';
import { escapeForMbox } from './mbox/splitter';
import { safeFilename } from './format';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadEml(meta: MessageMeta, source: Source) {
  const bytes = await readRfc822(meta, source);
  downloadBlob(new Blob([bytes as BlobPart], { type: 'message/rfc822' }), `${safeFilename(meta.subject || 'message')}.eml`);
}

/**
 * Build an mbox file from messages without loading them into memory: each part
 * is a lazy slice of the stored source file.
 */
export async function exportMbox(
  messages: MessageMeta[],
  sources: Map<string, Source>,
  filename: string,
): Promise<{ exported: number; skipped: number }> {
  const parts: BlobPart[] = [];
  const blobs = new Map<string, Blob | null>();
  let skipped = 0;
  const sorted = [...messages].sort((a, b) => a.date - b.date);
  for (const m of sorted) {
    const source = sources.get(m.sourceId);
    if (!source || !isSourceAvailable(source)) {
      skipped++;
      continue;
    }
    if (m.headerOffset === 0) {
      // Imported from a bare .eml: synthesize a separator and quote From lines.
      const raw = await readRfc822(m, source);
      parts.push(`From ${m.from.address || 'MAILER-DAEMON'} ${asctime(new Date(m.date || Date.now()))}\n`);
      parts.push(escapeForMbox(raw) as BlobPart, '\n\n');
      continue;
    }
    if (!blobs.has(source.id)) blobs.set(source.id, await sourceBlob(source).catch(() => null));
    const blob = blobs.get(source.id);
    if (!blob) {
      skipped++;
      continue;
    }
    parts.push(blob.slice(m.offset, m.offset + m.length));
    if (m.offset + m.length >= source.size) parts.push('\n');
  }
  const exported = sorted.length - skipped;
  if (exported) downloadBlob(new Blob(parts, { type: 'application/mbox' }), filename);
  return { exported, skipped };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** mbox separator date: `Mon Jan  1 00:00:00 2024` (UTC). */
function asctime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, ' ')} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} ${d.getUTCFullYear()}`;
}
