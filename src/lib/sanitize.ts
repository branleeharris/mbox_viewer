/**
 * Turn untrusted email HTML into a safe iframe document.
 *
 * - DOMPurify strips scripts, event handlers, forms and dangerous URLs.
 * - Remote images/backgrounds are blocked until the user allows them (privacy:
 *   loading them tells the sender you opened the mail, and from where).
 * - cid: references are rewritten to blob URLs of the inline attachments.
 * - The iframe document carries its own CSP as a second line of defense.
 * - Trailing quoted history is detected and trimmed, like Gmail's "•••".
 */
import DOMPurify from 'dompurify';
import { escapeRegExp } from './format';

export interface RenderInput {
  html: string;
  cidUrls: Map<string, string>;
  allowRemote: boolean;
  highlight: string[];
}

export interface RenderedHtml {
  full: string;
  /** Document with the quoted history removed, or null when nothing was trimmed. */
  trimmed: string | null;
  hasRemoteContent: boolean;
}

/** Only these may load without the user's say-so. Everything else (relative, `\\host`, `https:host`, …) is remote. */
const LOCAL_URL = /^(data:|blob:|cid:|#|$)/i;

/** Resolve a URL the way the browser would; returns an absolute http(s) URL or null. */
function absoluteHttp(v: string): string | null {
  try {
    const u = new URL(v, 'https://mv-relative.invalid/');
    if ((u.protocol === 'https:' || u.protocol === 'http:') && u.hostname !== 'mv-relative.invalid') return u.href;
  } catch {
    /* unparseable */
  }
  return null;
}

/** Decode CSS escapes (`\72` -> `r`, `\(` -> `(`) so `u\72l(` can't smuggle a url(). */
function decodeCssEscapes(css: string): string {
  return css
    .replace(/\\([0-9a-f]{1,6})[ \t\n\r\f]?/gi, (_m, hex: string) => {
      const cp = parseInt(hex, 16);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '\ufffd';
    })
    .replace(/\\\r?\n/g, '')
    .replace(/\\(.)/g, '$1');
}

function iframeCsp(allowRemote: boolean): string {
  const img = allowRemote ? "data: blob: https: http:" : 'data: blob:';
  return `default-src 'none'; style-src 'unsafe-inline'; img-src ${img}; font-src data:; media-src data: blob:`;
}

const BASE_CSS = `
html,body{margin:0;padding:0;background:#fff;color:#222}
body{font:small/1.5 Arial,Helvetica,sans-serif;font-size:14px;overflow-wrap:anywhere;word-break:break-word;padding:0 2px}
img{max-width:100%;height:auto}
table{max-width:100%}
pre{white-space:pre-wrap}
blockquote{margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex}
a{color:#1a0dab}
mark.mv-hl{background:#fde293;color:inherit;padding:0}
img[data-mv-blocked]{display:inline-block;background:#f1f3f4;min-width:16px;min-height:16px}
`;

export function renderEmailHtml(input: RenderInput): RenderedHtml {
  let hasRemote = false;

  const rewriteUrl = (value: string): string | null => {
    const v = value.trim();
    if (/^cid:/i.test(v)) {
      const id = v.slice(4).replace(/^<|>$/g, '').toLowerCase();
      return input.cidUrls.get(id) ?? '';
    }
    // blob: URLs in email content can't point at anything legitimate; only ours (from cid:) are allowed.
    if (/^data:/i.test(v)) return v;
    hasRemote = true;
    if (!input.allowRemote) return null;
    return absoluteHttp(v);
  };

  const cleanCss = (raw: string): string => {
    let out = decodeCssEscapes(raw).replace(/@import\b[^;]*;?/gi, '');
    out = out.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (_m, _q, url: string) => {
      const u = url.trim();
      if (/^cid:/i.test(u)) {
        const blobUrl = input.cidUrls.get(u.slice(4).replace(/^<|>$/g, '').toLowerCase());
        return blobUrl ? `url("${blobUrl}")` : 'none';
      }
      if (/^data:/i.test(u)) return `url("${u.replace(/"/g, '%22')}")`;
      hasRemote = true;
      const abs = input.allowRemote ? absoluteHttp(u) : null;
      return abs ? `url("${abs.replace(/"/g, '%22')}")` : 'none';
    });
    // image-set("https://…") takes bare strings, not url().
    if (/image-set\(/i.test(out)) {
      hasRemote = true;
      if (!input.allowRemote) out = out.replace(/(-webkit-)?image-set\([^;}]*\)/gi, 'none');
    }
    // Decoding may have produced "<" (e.g. from \3C); re-escape so "</style>" can't close the block.
    return out.replace(/</g, '\\3c ');
  };

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;
    if (!el.getAttribute) return;
    const tag = el.localName;
    if (tag === 'a' || tag === 'area') {
      // Every link opens a new tab with no opener, whatever the email asked for.
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
    for (const attr of ['src', 'background', 'poster']) {
      const v = el.getAttribute(attr);
      if (v == null) continue;
      const r = rewriteUrl(v);
      if (r === null) {
        el.removeAttribute(attr);
        el.setAttribute('data-mv-blocked', '');
      } else if (r !== v) {
        el.setAttribute(attr, r);
      }
    }
    if (el.hasAttribute('srcset')) {
      const set = el.getAttribute('srcset') ?? '';
      if (set.split(',').some((c) => !LOCAL_URL.test(c.trim()))) {
        hasRemote = true;
        if (!input.allowRemote) el.removeAttribute('srcset');
      }
    }
    const style = el.getAttribute('style');
    if (style) el.setAttribute('style', cleanCss(style));
  });
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'style' && node.textContent) node.textContent = cleanCss(node.textContent);
  });

  let root: HTMLElement;
  try {
    root = DOMPurify.sanitize(input.html, {
      WHOLE_DOCUMENT: true,
      RETURN_DOM: true,
      // SVG <image>/<feImage>/<use> and media elements fetch via href/src variants we'd have to chase.
      FORBID_TAGS: [
        'form', 'input', 'button', 'textarea', 'select', 'option', 'meta', 'link', 'base',
        'image', 'feImage', 'use', 'video', 'audio', 'source', 'track',
      ],
      FORBID_ATTR: ['action', 'formaction', 'ping', 'xlink:href'],
      ADD_ATTR: ['target'],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    }) as HTMLElement;
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
    DOMPurify.removeHook('uponSanitizeElement');
  }

  const body = root.querySelector('body') ?? root;
  const styles = [...root.querySelectorAll('style')].map((s) => {
    s.remove();
    return s.outerHTML;
  });

  if (input.highlight.length) highlightDom(body, input.highlight);

  const wrap = (inner: string) =>
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${iframeCsp(input.allowRemote)}">` +
    `<meta name="referrer" content="no-referrer"><base target="_blank">` +
    `<style>${BASE_CSS}</style>${styles.join('')}</head><body>${inner}</body></html>`;

  const full = wrap(body.innerHTML);

  let trimmed: string | null = null;
  const clone = body.cloneNode(true) as HTMLElement;
  const quote = findQuoteStart(clone);
  if (quote) {
    truncateFrom(quote, clone);
    if (hasContent(clone)) trimmed = wrap(clone.innerHTML);
  }

  return { full, trimmed, hasRemoteContent: hasRemote };
}

const QUOTE_SELECTORS = [
  '.gmail_quote_container',
  '.gmail_quote',
  'blockquote[type="cite"]',
  '.moz-cite-prefix',
  '#appendonsend',
  '#divRplyFwdMsg',
  '#mail-editor-reference-message-container',
  '.OutlookMessageHeader',
  '.yahoo_quoted',
  '.protonmail_quote',
  '.zmail_extra',
  'div[style*="border-top:solid #E1E1E1"]',
  'div[style*="border-top: solid #E1E1E1"]',
  'div[style*="border-top:solid #B5C4DF"]',
  'div[style*="border-top: solid #B5C4DF"]',
];

const ON_WROTE = /^On\s[\s\S]{4,400}?(wrote|écrit|schrieb|escribió):\s*$/i;
const OUTLOOK_HEADER = /^From:\s[\s\S]{1,300}(Sent|Date):\s[\s\S]{1,300}Subject:/i;

function textOf(n: Node): string {
  return (n.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function isForward(el: Element): boolean {
  return /^-+\s*Forwarded message/i.test(textOf(el)) || /^Begin forwarded message/i.test(textOf(el));
}

/** Earliest element (in document order) where quoted history starts. */
function findQuoteStart(body: HTMLElement): Node | null {
  const candidates: Node[] = [];

  for (const el of body.querySelectorAll(QUOTE_SELECTORS.join(','))) {
    if (isForward(el)) continue;
    let start: Node = el;
    if (el.matches('blockquote[type="cite"]')) {
      // Include an "On … wrote:" attribution right before the blockquote.
      let prev = el.previousSibling;
      while (prev && (prev.nodeName === 'BR' || (prev.nodeType === Node.TEXT_NODE && !textOf(prev)))) {
        prev = prev.previousSibling;
      }
      if (prev && /wrote:\s*$/i.test(textOf(prev))) start = prev;
    }
    if (el.id === 'divRplyFwdMsg') {
      const prev = el.previousElementSibling;
      if (prev?.tagName === 'HR') start = prev;
    }
    if (el.matches('div[style*="border-top"]')) {
      if (!OUTLOOK_HEADER.test(textOf(el))) continue;
      const parent = el.parentElement;
      if (parent && parent !== body && parent.children.length === 1) start = parent;
    }
    candidates.push(start);
  }

  // Text-only markers in markup with no recognizable classes.
  for (const el of body.querySelectorAll('div, p')) {
    const t = textOf(el);
    if (t.length > 700) continue;
    if (!ON_WROTE.test(t) && !OUTLOOK_HEADER.test(t)) continue;
    // Prefer the innermost matching element.
    const child = [...el.children].some((c) => {
      const ct = textOf(c);
      return ON_WROTE.test(ct) || OUTLOOK_HEADER.test(ct);
    });
    if (!child) candidates.push(el);
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  return candidates[0];
}

/** Remove `node`, everything after it, and everything after each of its ancestors. */
function truncateFrom(node: Node, root: Node) {
  let cur: Node = node;
  while (cur !== root && cur.parentNode) {
    const parent: Node = cur.parentNode;
    let n = cur.nextSibling;
    while (n) {
      const next = n.nextSibling;
      parent.removeChild(n);
      n = next;
    }
    if (cur === node) parent.removeChild(cur);
    cur = parent;
  }
}

function hasContent(el: HTMLElement): boolean {
  return !!textOf(el) || !!el.querySelector('img, table');
}

function highlightDom(body: HTMLElement, terms: string[]) {
  const re = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  const walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement?.tagName;
      return p === 'STYLE' || p === 'TITLE' || p === 'MARK' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const t of nodes) {
    const s = t.data;
    re.lastIndex = 0;
    if (!re.test(s)) continue;
    const frag = body.ownerDocument.createDocumentFragment();
    let last = 0;
    s.replace(re, (m, _g, idx: number) => {
      if (idx > last) frag.appendChild(body.ownerDocument.createTextNode(s.slice(last, idx)));
      const mark = body.ownerDocument.createElement('mark');
      mark.className = 'mv-hl';
      mark.textContent = m;
      frag.appendChild(mark);
      last = idx + m.length;
      return m;
    });
    if (last < s.length) frag.appendChild(body.ownerDocument.createTextNode(s.slice(last)));
    t.replaceWith(frag);
  }
}
