import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Attachment } from 'postal-mime';
import { useStore } from '../store';
import type { MessageMeta, Source } from '../lib/types';
import { parseFull, registerSessionFile, type ParsedMessage } from '../lib/raw';
import { renderEmailHtml } from '../lib/sanitize';
import { splitQuotedText } from '../lib/quotes';
import { escapeRegExp } from '../lib/format';
import { Icon } from './Icon';
import { Attachments } from './Attachments';

export function useParsed(meta: MessageMeta, source: Source | undefined) {
  const [state, setState] = useState<{ parsed?: ParsedMessage; error?: string }>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({});
    if (!source) {
      setState({ error: 'The mailbox file for this message was removed.' });
      return;
    }
    parseFull(meta, source).then(
      (parsed) => alive && setState({ parsed }),
      (err: unknown) => alive && setState({ error: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      alive = false;
    };
  }, [meta.id, source, retry]);
  return { ...state, retry: () => setRetry((n) => n + 1) };
}

/**
 * Blob URLs for inline (cid:) parts. Created and revoked inside one effect so
 * StrictMode's simulated remount can't leave the message pointing at revoked URLs.
 * Returns null until ready.
 */
export function useCidUrls(attachments: Attachment[] | undefined) {
  const [urls, setUrls] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    if (!attachments) {
      setUrls(null);
      return;
    }
    const map = new Map<string, string>();
    for (const a of attachments) {
      if (!a.contentId || !a.mimeType.startsWith('image/') || a.mimeType === 'image/svg+xml') continue;
      const id = a.contentId.replace(/^<|>$/g, '').toLowerCase();
      map.set(id, URL.createObjectURL(new Blob([a.content as BlobPart], { type: a.mimeType })));
    }
    setUrls(map);
    return () => map.forEach((u) => URL.revokeObjectURL(u));
  }, [attachments]);
  return urls;
}

export function HtmlFrame({ doc }: { doc: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(80);
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let ro: ResizeObserver | null = null;
    const measure = () => {
      const d = frame.contentDocument;
      if (!d?.documentElement) return;
      setHeight(Math.max(d.documentElement.scrollHeight, d.body?.scrollHeight ?? 0) + 2);
    };
    const onLoad = () => {
      measure();
      const d = frame.contentDocument;
      if (!d?.body) return;
      ro = new ResizeObserver(measure);
      ro.observe(d.body);
      d.querySelectorAll('img').forEach((img) => img.addEventListener('load', measure));
    };
    frame.addEventListener('load', onLoad);
    return () => {
      frame.removeEventListener('load', onLoad);
      ro?.disconnect();
    };
  }, [doc]);
  return (
    <iframe
      ref={ref}
      title="Message body"
      srcDoc={doc}
      // No allow-scripts: email content can never run code. allow-same-origin lets us size the frame.
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      className="block w-full border-0 bg-white dark:rounded-lg"
      style={{ height }}
    />
  );
}

const LINK_RE = /(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]|[\w.+-]+@[\w-]+\.[\w.-]*\w)/g;

function linkify(text: string, highlight: string[]): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  const hl = highlight.length ? new RegExp(`(${highlight.map(escapeRegExp).join('|')})`, 'gi') : null;
  const pushText = (s: string) => {
    if (!hl) {
      out.push(s);
      return;
    }
    s.split(hl).forEach((part, i) => {
      if (i % 2) out.push(<mark key={key++} className="bg-[#fde293] text-inherit">{part}</mark>);
      else if (part) out.push(part);
    });
  };
  text.replace(LINK_RE, (m, _g, idx: number) => {
    if (idx > last) pushText(text.slice(last, idx));
    const href = m.includes('@') && !m.startsWith('http') ? `mailto:${m}` : m;
    out.push(
      <a key={key++} href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline">
        {m}
      </a>,
    );
    last = idx + m.length;
    return m;
  });
  if (last < text.length) pushText(text.slice(last));
  return out;
}

function TrimToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? 'Hide expanded content' : 'Show trimmed content'}
      title={open ? 'Hide expanded content' : 'Show trimmed content'}
      aria-expanded={open}
      className="my-2 flex h-3.5 w-6 items-center justify-center rounded-full bg-chip text-ink-2 hover:bg-line-strong"
    >
      <Icon name="more_horiz" size={18} />
    </button>
  );
}

export function MessageBody({ meta, source }: { meta: MessageMeta; source: Source | undefined }) {
  const { parsed, error, retry } = useParsed(meta, source);
  const policy = useStore((s) => s.settings.imagePolicy);
  const trusted = useStore((s) => s.settings.trustedImageSenders);
  const highlight = useStore((s) => s.list.highlight);
  const [showImages, setShowImages] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const cidUrls = useCidUrls(parsed?.email.attachments);
  const allowRemote = showImages || policy === 'always' || trusted.includes(meta.from.address);

  const rendered = useMemo(() => {
    if (!parsed?.email.html || !cidUrls) return null;
    return renderEmailHtml({ html: parsed.email.html, cidUrls, allowRemote, highlight });
  }, [parsed, cidUrls, allowRemote, highlight]);

  const text = useMemo(() => {
    if (!parsed || parsed.email.html) return null;
    return splitQuotedText(parsed.email.text ?? '');
  }, [parsed]);

  if (error) {
    return <MissingFile message={error} source={source} onLocated={retry} />;
  }
  if (!parsed || (parsed.email.html && !rendered)) {
    return (
      <div className="space-y-2 py-2" aria-busy="true" aria-label="Loading message">
        <div className="h-3 w-3/4 animate-pulse rounded bg-chip" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-chip" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-chip" />
      </div>
    );
  }

  return (
    <div>
      {rendered?.hasRemoteContent && !allowRemote && (
        <div className="mb-3 rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning-ink">
          <Icon name="hide_image" size={16} className="mr-1 inline align-text-bottom" />
          Images in this message are hidden to protect your privacy.{' '}
          <button type="button" className="font-medium underline" onClick={() => setShowImages(true)}>
            Display images below
          </button>
          {meta.from.address && (
            <>
              {' · '}
              <button
                type="button"
                className="font-medium underline"
                onClick={() => {
                  const s = useStore.getState();
                  s.updateSettings({ trustedImageSenders: [...new Set([...s.settings.trustedImageSenders, meta.from.address])] });
                }}
              >
                Always display images from {meta.from.address}
              </button>
            </>
          )}
        </div>
      )}

      {rendered ? (
        <>
          <div className="overflow-x-auto dark:rounded-lg dark:bg-white dark:p-3">
            <HtmlFrame doc={expanded || !rendered.trimmed ? rendered.full : rendered.trimmed} />
          </div>
          {rendered.trimmed && <TrimToggle open={expanded} onClick={() => setExpanded((e) => !e)} />}
        </>
      ) : text ? (
        <div className="text-sm leading-relaxed break-words whitespace-pre-wrap text-ink">
          {linkify(text.main, highlight)}
          {text.quoted && (
            <>
              <TrimToggle open={expanded} onClick={() => setExpanded((e) => !e)} />
              {expanded && <div className="text-ink-2">{linkify(text.quoted, highlight)}</div>}
            </>
          )}
          {!text.main.trim() && !text.quoted && <span className="text-ink-3 italic">(This message has no text.)</span>}
        </div>
      ) : null}

      <Attachments attachments={parsed.email.attachments.filter((a) => !a.related)} />
    </div>
  );
}

function MissingFile({ message, source, onLocated }: { message: string; source: Source | undefined; onLocated: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  return (
    <div className="rounded-lg border border-line p-4 text-sm text-ink-2">
      <p className="mb-2 flex items-center gap-2 text-ink">
        <Icon name="error" size={18} className="text-danger" /> {message}
      </p>
      {source && !source.persisted && (
        <>
          <p className="mb-3">
            "{source.name}" was too large to keep in browser storage, so only its index was saved. Select the same file again to keep reading.
          </p>
          <input
            ref={input}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (f.size !== source.size) {
                setErr(`That file is ${f.size.toLocaleString()} bytes; expected ${source.size.toLocaleString()}.`);
                return;
              }
              registerSessionFile(source.id, f);
              onLocated();
            }}
          />
          <button type="button" onClick={() => input.current?.click()} className="rounded-full bg-accent px-4 py-2 font-medium text-surface">
            Locate “{source.name}”
          </button>
          {err && <p className="mt-2 text-danger">{err}</p>}
        </>
      )}
    </div>
  );
}
