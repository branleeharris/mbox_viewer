/**
 * Streaming, byte-level mbox splitter.
 *
 * Works on raw bytes so no character decoding happens until each MIME part is
 * decoded with its own declared charset. Feed it chunks of any size and it
 * yields complete messages with their absolute byte offsets in the file.
 */

export interface RawMessage {
  /** Absolute byte offset of the message (its `From ` line) in the file. */
  offset: number;
  /** Message bytes including the `From ` separator line. */
  bytes: Uint8Array;
}

const LF = 0x0a;
const CR = 0x0d;
const FROM = [0x46, 0x72, 0x6f, 0x6d, 0x20]; // "From "

function startsWithFrom(buf: Uint8Array, p: number): boolean {
  if (p + 5 > buf.length) return false;
  for (let i = 0; i < 5; i++) if (buf[p + i] !== FROM[i]) return false;
  return true;
}

const latin1 = new TextDecoder('latin1');

/**
 * Validate a candidate separator line. A real separator looks like
 * `From sender@example.com Mon Jan  1 00:00:00 2024` and is followed by a
 * header line. Unescaped "From " lines inside bodies rarely satisfy both.
 */
function isSeparator(line: string, nextLine: string): boolean {
  if (!/^From \S*.*\d/.test(line)) return false;
  return /^[!-9;-~]+:/.test(nextLine) || nextLine.trim() === '';
}

export class MboxSplitter {
  private buf: Uint8Array = new Uint8Array(0);
  /** Absolute file offset of buf[0]. */
  private base = 0;
  /** Buffer index of the current message's start, or -1 before the first separator. */
  private msgStart = -1;
  /** Next buffer index to scan for a separator. */
  private scan = 0;
  private sawAnyData = false;
  private notMbox = false;

  push(chunk: Uint8Array): RawMessage[] {
    if (chunk.length === 0) return [];
    if (this.buf.length === 0) {
      this.buf = chunk;
    } else {
      const next = new Uint8Array(this.buf.length + chunk.length);
      next.set(this.buf);
      next.set(chunk, this.buf.length);
      this.buf = next;
    }
    return this.drain(false);
  }

  end(): RawMessage[] {
    return this.drain(true);
  }

  private drain(final: boolean): RawMessage[] {
    const out: RawMessage[] = [];
    const buf = this.buf;

    if (!this.sawAnyData && buf.length > 0) {
      // Skip a UTF-8 BOM and leading blank lines.
      let p = 0;
      if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) p = 3;
      while (p < buf.length && (buf[p] === LF || buf[p] === CR)) p++;
      if (p >= buf.length && !final) return out;
      this.sawAnyData = true;
      if (startsWithFrom(buf, p)) {
        this.msgStart = p;
        this.scan = p + 1;
      } else if (buf.length - p >= 5 || final) {
        // Not an mbox: treat the whole file as a single .eml message.
        this.notMbox = true;
        this.msgStart = p;
      } else {
        this.sawAnyData = false;
        return out;
      }
    }

    if (!this.notMbox && this.msgStart >= 0) {
      while (true) {
        const nl = buf.indexOf(LF, this.scan);
        if (nl < 0) break;
        const p = nl + 1;
        if (p + 5 > buf.length) {
          if (!final) break;
          this.scan = buf.length;
          break;
        }
        if (!startsWithFrom(buf, p)) {
          this.scan = p;
          continue;
        }
        // Need this line and the next one to validate.
        const eol1 = buf.indexOf(LF, p);
        const eol2 = eol1 < 0 ? -1 : buf.indexOf(LF, eol1 + 1);
        if (eol2 < 0 && !final) break;
        const line = latin1.decode(buf.subarray(p, eol1 < 0 ? buf.length : eol1)).replace(/\r$/, '');
        const next =
          eol1 < 0 ? '' : latin1.decode(buf.subarray(eol1 + 1, eol2 < 0 ? buf.length : eol2)).replace(/\r$/, '');
        if (isSeparator(line, next)) {
          out.push({ offset: this.base + this.msgStart, bytes: buf.slice(this.msgStart, p) });
          this.msgStart = p;
        }
        this.scan = p + 1;
      }
    }

    if (final) {
      if (this.msgStart >= 0 && this.msgStart < buf.length) {
        out.push({ offset: this.base + this.msgStart, bytes: buf.slice(this.msgStart) });
      }
      this.buf = new Uint8Array(0);
      this.msgStart = -1;
      return out;
    }

    // Drop bytes before the current message so memory stays bounded.
    if (this.msgStart > 0) {
      this.buf = buf.slice(this.msgStart);
      this.base += this.msgStart;
      this.scan -= this.msgStart;
      this.msgStart = 0;
    }
    return out;
  }
}

/** Length of the `From ` separator line including its line ending, or 0 for .eml input. */
export function separatorLength(bytes: Uint8Array): number {
  if (!startsWithFrom(bytes, 0)) return 0;
  const nl = bytes.indexOf(LF);
  return nl < 0 ? bytes.length : nl + 1;
}

/** The separator line itself as text, e.g. `From 123@xxx Mon Jan 01 00:00:00 +0000 2024`. */
export function separatorLine(bytes: Uint8Array): string {
  const len = separatorLength(bytes);
  return len ? latin1.decode(bytes.subarray(0, len)).replace(/\r?\n$/, '') : '';
}

/**
 * Turn mbox message bytes (separator included) into RFC 822 bytes: drop the
 * separator, undo `>From ` quoting (mboxrd/mboxo), and trim the trailing
 * blank line that separates messages.
 */
export function toRfc822(bytes: Uint8Array): Uint8Array {
  let start = separatorLength(bytes);
  let end = bytes.length;
  while (end > start && (bytes[end - 1] === LF || bytes[end - 1] === CR)) end--;
  if (end < bytes.length) {
    // Keep exactly one line ending.
    end = bytes[end] === CR && bytes[end + 1] === LF ? end + 2 : end + 1;
  }
  const body = bytes.subarray(start, end);

  // Fast path: no quoted From lines.
  if (!hasQuotedFrom(body)) return body;

  const out = new Uint8Array(body.length);
  let o = 0;
  let lineStart = true;
  for (let i = 0; i < body.length; i++) {
    const b = body[i];
    if (lineStart && b === 0x3e /* > */) {
      // Count the run of '>' and check it's followed by "From ".
      let j = i;
      while (j < body.length && body[j] === 0x3e) j++;
      if (startsWithFrom(body, j)) {
        // Remove one level of quoting.
        out.set(body.subarray(i + 1, j), o);
        o += j - i - 1;
        i = j - 1;
        lineStart = false;
        continue;
      }
    }
    out[o++] = b;
    lineStart = b === LF;
  }
  return out.subarray(0, o);
}

function hasQuotedFrom(body: Uint8Array): boolean {
  let i = body[0] === 0x3e ? 0 : body.indexOf(0x3e);
  while (i >= 0) {
    if (i === 0 || body[i - 1] === LF) {
      let j = i;
      while (j < body.length && body[j] === 0x3e) j++;
      if (startsWithFrom(body, j)) return true;
    }
    i = body.indexOf(0x3e, i + 1);
  }
  return false;
}

/** Quote a raw RFC 822 message for inclusion in an mboxrd file. */
export function escapeForMbox(rfc822: Uint8Array): Uint8Array {
  const parts: number[] = [];
  let lineStart = true;
  let needs = false;
  for (let i = 0; i < rfc822.length; i++) {
    if (lineStart) {
      let j = i;
      while (j < rfc822.length && rfc822[j] === 0x3e) j++;
      if (startsWithFrom(rfc822, j)) {
        parts.push(i);
        needs = true;
      }
    }
    lineStart = rfc822[i] === LF;
  }
  if (!needs) return rfc822;
  const out = new Uint8Array(rfc822.length + parts.length);
  let o = 0;
  let prev = 0;
  for (const at of parts) {
    out.set(rfc822.subarray(prev, at), o);
    o += at - prev;
    out[o++] = 0x3e;
    prev = at;
  }
  out.set(rfc822.subarray(prev), o);
  return out;
}
