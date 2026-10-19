/**
 * Quoted-text detection for plain-text bodies. Gmail hides the trailing quoted
 * history of a reply behind a "•••" button; this finds where that history starts.
 * (HTML bodies are trimmed on the DOM in sanitize.ts.)
 */

const ORIGINAL_MESSAGE = /^\s*-{2,}\s*(Original Message|Forwarded message|Reply message)\s*-{2,}\s*$/i;
const UNDERSCORE_RULE = /^\s*_{10,}\s*$/;
const OUTLOOK_FROM = /^\s*\*?From:\*?\s+\S/i;
const OUTLOOK_NEXT = /^\s*\*?(Sent|Date|To|Subject|Cc):\*?\s/i;
const ON_WROTE_START = /^\s*On\s.+/i;
const WROTE_END = /(wrote|écrit|schrieb|escribió|scrisse|schreef|skrev):\s*$/i;
const ISO_ATTRIBUTION = /^\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}.*<[^>]+@[^>]+>:?\s*$/;

/** Returns the line index where trailing quoted content begins, or -1. */
export function findQuoteStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (ORIGINAL_MESSAGE.test(line) && !/forwarded/i.test(line)) return i;

    if (UNDERSCORE_RULE.test(line) && i + 1 < lines.length && OUTLOOK_FROM.test(lines[i + 1])) return i;

    if (OUTLOOK_FROM.test(line)) {
      let headerish = 0;
      for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) if (OUTLOOK_NEXT.test(lines[j])) headerish++;
      if (headerish >= 2) return i;
    }

    // "On Tue, Mar 4, 2024 at 3:15 PM Alice <a@x.com> wrote:" — possibly wrapped over several lines.
    if (ON_WROTE_START.test(line)) {
      let joined = line;
      for (let j = i; j < Math.min(lines.length, i + 8); j++) {
        if (j > i) joined += ' ' + lines[j];
        if (WROTE_END.test(lines[j]) && /\d/.test(joined) && joined.length < 600) return i;
        if (lines[j].trim() === '' && j > i) break;
      }
    }

    if (ISO_ATTRIBUTION.test(line)) return i;

    // A trailing block of ">" lines.
    if (/^\s*>/.test(line)) {
      let j = i;
      while (j < lines.length && (/^\s*>/.test(lines[j]) || lines[j].trim() === '')) j++;
      if (j >= lines.length && j - i >= 2) {
        // Include an attribution line just before it, if any.
        const prev = i - 1 >= 0 && lines[i - 1].trim() === '' ? i - 2 : i - 1;
        if (prev >= 0 && WROTE_END.test(lines[prev])) return prev;
        return i;
      }
    }
  }
  return -1;
}

export interface SplitText {
  main: string;
  quoted: string;
}

/** Split a plain-text body into the new content and the trailing quoted history. */
export function splitQuotedText(text: string): SplitText {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const at = findQuoteStart(lines);
  if (at <= 0) return { main: text, quoted: '' };
  const main = lines.slice(0, at).join('\n').replace(/\s+$/, '');
  if (!main.trim()) return { main: text, quoted: '' };
  return { main, quoted: lines.slice(at).join('\n') };
}

/** Collapse a body into a one-line Gmail-style snippet. */
export function makeSnippet(text: string, max = 200): string {
  const { main } = splitQuotedText(text);
  const s = main
    .replace(/\[(?:cid|image):[^\]]*\]/gi, '')
    .replace(/<https?:\/\/[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? s.slice(0, max) : s;
}
