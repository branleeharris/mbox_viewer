import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { SHORTCUTS } from '../hooks/useShortcuts';
import { Dialog } from './ui';
import { Icon } from './Icon';
import { HtmlFrame, useCidUrls } from './MessageBody';
import { downloadEml } from '../lib/export';
import { parseFull, type ParsedMessage } from '../lib/raw';
import { renderEmailHtml } from '../lib/sanitize';
import { splitQuotedText } from '../lib/quotes';
import { formatAddress, fullDate, formatBytes } from '../lib/format';
import type { MessageMeta } from '../lib/types';

export function ShortcutsDialog() {
  const open = useStore((s) => s.shortcutsOpen);
  if (!open) return null;
  return (
    <Dialog title="Keyboard shortcuts" onClose={() => useStore.setState({ shortcutsOpen: false })}>
      <table className="w-full text-sm">
        <tbody>
          {SHORTCUTS.map(([k, d]) => (
            <tr key={k} className="border-b border-line last:border-0">
              <td className="py-2 pr-4 whitespace-nowrap">
                <kbd className="rounded border border-line-strong bg-chip px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
              </td>
              <td className="py-2 text-ink-2">{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

export function UnloadDialog() {
  const open = useStore((s) => s.unloadOpen);
  const sources = useStore((s) => s.sources);
  const count = useStore((s) => s.messages.size);
  const importing = useStore((s) => !!s.importing);
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const names = [...sources.values()].map((x) => x.name);
  const close = () => !busy && useStore.setState({ unloadOpen: false });
  return (
    <Dialog title="Unload mailbox?" onClose={close}>
      <p className="mb-3 text-sm text-ink-2">
        This removes {count.toLocaleString()} message{count === 1 ? '' : 's'}
        {names.length ? (
          <>
            {' '}from <b className="text-ink">{names.length === 1 ? names[0] : `${names.length} files`}</b>
          </>
        ) : null}{' '}
        from this browser{importing ? ' and stops the import in progress' : ''}. Your original files aren't changed, and your display settings are kept.
      </p>
      {names.length > 1 && (
        <ul className="mb-3 max-h-32 list-disc overflow-auto pl-5 text-xs text-ink-3">
          {names.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={close} className="rounded-full px-4 py-2 text-sm font-medium text-accent hover:bg-hover">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          autoFocus
          onClick={async () => {
            setBusy(true);
            try {
              await useStore.getState().clearAll(true);
              useStore.getState().showToast('Mailbox unloaded');
            } finally {
              setBusy(false);
            }
          }}
          className="flex items-center gap-2 rounded-full bg-danger px-5 py-2 text-sm font-medium text-surface hover:shadow disabled:opacity-60"
        >
          <Icon name="eject" size={18} /> {busy ? 'Unloading…' : 'Unload'}
        </button>
      </div>
    </Dialog>
  );
}

const utf8 = new TextDecoder('utf-8');
const SHOW_LIMIT = 2 * 1024 * 1024;

function authResult(headers: { key: string; value: string }[], method: string): string | null {
  for (const h of headers) {
    if (h.key !== 'authentication-results' && h.key !== 'arc-authentication-results') continue;
    const m = new RegExp(`\\b${method}=(\\w+)`, 'i').exec(h.value);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

/** Gmail's "Show original": header summary plus the raw source. */
export function OriginalMessage() {
  const id = useStore((s) => s.originalMessageId);
  const meta = useStore((s) => (id ? s.messages.get(id) : undefined));
  const source = useStore((s) => (meta ? s.sources.get(meta.sourceId) : undefined));
  const [parsed, setParsed] = useState<ParsedMessage | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setParsed(null);
    setError('');
    if (!meta || !source) return;
    parseFull(meta, source).then(setParsed, (e: Error) => setError(e.message));
  }, [meta, source]);

  const rawText = useMemo(() => (parsed ? utf8.decode(parsed.raw.subarray(0, SHOW_LIMIT)) : ''), [parsed]);

  if (!id || !meta) return null;
  const close = () => useStore.setState({ originalMessageId: null });
  const rows: [string, string][] = [
    ['Message ID', meta.messageId ? `<${meta.messageId}>` : '(none)'],
    ['Created at', fullDate(meta.date)],
    ['From', formatAddress(meta.from)],
    ['To', meta.to.map(formatAddress).join(', ') || '—'],
    ['Subject', meta.subject || '(no subject)'],
  ];
  if (parsed) {
    for (const m of ['spf', 'dkim', 'dmarc']) {
      const r = authResult(parsed.email.headers, m);
      if (r) rows.push([m.toUpperCase(), r]);
    }
  }
  rows.push(['Size', formatBytes(meta.length)]);
  if (source) rows.push(['Mailbox file', `${source.name} (byte ${meta.offset.toLocaleString()})`]);

  return (
    <Dialog title="Original message" onClose={close} wide>
      <table className="mb-4 w-full text-sm">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-line">
              <td className="w-40 py-2 pr-4 align-top text-ink-3">{k}</td>
              <td className="py-2 break-all">
                {['PASS', 'FAIL', 'SOFTFAIL', 'NEUTRAL', 'NONE', 'TEMPERROR', 'PERMERROR'].includes(v) ? (
                  <span className={v === 'PASS' ? 'font-medium text-[#188038]' : 'font-medium text-danger'}>{v}</span>
                ) : (
                  v
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          disabled={!source}
          onClick={() => source && downloadEml(meta, source)}
          className="flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-surface"
        >
          <Icon name="download" size={18} /> Download original
        </button>
        <button
          type="button"
          disabled={!parsed}
          onClick={async () => {
            await navigator.clipboard.writeText(rawText);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-2 rounded-full border border-line-strong px-4 py-1.5 text-sm font-medium text-accent"
        >
          <Icon name="content_copy" size={18} /> {copied ? 'Copied' : 'Copy to clipboard'}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : !parsed ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <>
          {parsed.raw.length > SHOW_LIMIT && (
            <p className="mb-2 text-xs text-ink-3">Showing the first {formatBytes(SHOW_LIMIT)}. Download the original for the full message.</p>
          )}
          <pre className="max-h-[50vh] overflow-auto rounded-lg bg-app p-4 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-ink">{rawText}</pre>
        </>
      )}
    </Dialog>
  );
}

function PrintMessage({ m, p }: { m: MessageMeta; p: ParsedMessage }) {
  const settings = useStore.getState().settings;
  const allowRemote = settings.imagePolicy === 'always' || settings.trustedImageSenders.includes(m.from.address);
  const cidUrls = useCidUrls(p.email.attachments);
  const html = useMemo(() => {
    if (!p.email.html || !cidUrls) return null;
    const r = renderEmailHtml({ html: p.email.html, cidUrls, allowRemote, highlight: [] });
    return { doc: r.trimmed ?? r.full, trimmed: !!r.trimmed };
  }, [p, allowRemote, cidUrls]);
  const text = useMemo(() => (p.email.html ? null : splitQuotedText(p.email.text ?? '')), [p]);
  const atts = p.email.attachments.filter((a) => !a.related);
  return (
    <div style={{ borderTop: '1px solid #ccc', padding: '12px 0', breakInside: 'avoid-page' }}>
      <table style={{ width: '100%', fontSize: 13 }}>
        <tbody>
          <tr>
            <td>
              <b>{m.from.name || m.from.address}</b> {m.from.name && <span style={{ color: '#555' }}>&lt;{m.from.address}&gt;</span>}
            </td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fullDate(m.date)}</td>
          </tr>
          <tr>
            <td colSpan={2} style={{ color: '#555' }}>
              To: {m.to.map(formatAddress).join(', ') || '—'}
              {m.cc.length > 0 && (
                <>
                  <br />
                  Cc: {m.cc.map(formatAddress).join(', ')}
                </>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: 12, fontSize: 13 }}>
        {p.email.html && !html ? <div data-print-pending /> : html ? <HtmlFrame doc={html.doc} /> : <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'Arial, sans-serif' }}>{text?.main}</div>}
        {(html?.trimmed || text?.quoted) && <div style={{ color: '#777', marginTop: 8 }}>[Quoted text hidden]</div>}
      </div>
      {atts.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#333' }}>
          <b>
            {atts.length} attachment{atts.length === 1 ? '' : 's'}
          </b>
          <ul style={{ margin: '4px 0 0 18px' }}>
            {atts.map((a, i) => (
              <li key={i}>
                {a.filename || 'attachment'} ({formatBytes(typeof a.content === 'string' ? a.content.length : a.content.byteLength)})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Renders the print layout into #print-root, then opens the browser print dialog. */
export function PrintView() {
  const threadId = useStore((s) => s.printThreadId);
  const messageId = useStore((s) => s.printMessageId);
  const state = useStore.getState();
  const ids = threadId ? (state.threads.get(threadId)?.messageIds ?? []) : messageId ? [messageId] : [];
  const key = ids.join(',');
  const [loaded, setLoaded] = useState<{ key: string; items: { m: MessageMeta; p: ParsedMessage }[] } | null>(null);

  useEffect(() => {
    if (!ids.length) return;
    let alive = true;
    const s = useStore.getState();
    Promise.all(
      ids.map(async (id) => {
        const m = s.messages.get(id)!;
        return { m, p: await parseFull(m, s.sources.get(m.sourceId)!) };
      }),
    ).then(
      (items) => alive && setLoaded({ key, items }),
      (e: Error) => {
        useStore.setState({ printThreadId: null, printMessageId: null });
        s.showToast(`Can't print: ${e.message}`);
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!loaded || loaded.key !== key || !ids.length) return;
    const done = () => {
      useStore.setState({ printThreadId: null, printMessageId: null });
      setLoaded(null);
    };
    window.addEventListener('afterprint', done, { once: true });
    // Wait for the message iframes to load and size themselves (max ~3s), then print.
    let tries = 0;
    let t: ReturnType<typeof setTimeout>;
    const ready = () =>
      !document.querySelector('#print-root [data-print-pending]') &&
      [...document.querySelectorAll<HTMLIFrameElement>('#print-root iframe')].every(
        (f) => f.contentDocument?.readyState === 'complete' && f.offsetHeight > 0,
      );
    const tick = () => {
      if (ready() || ++tries > 30) t = setTimeout(() => window.print(), 100);
      else t = setTimeout(tick, 100);
    };
    t = setTimeout(tick, 100);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', done);
    };
  }, [loaded, key, ids.length]);

  if (!ids.length || !loaded || loaded.key !== key) return null;
  const subject = loaded.items[0]?.m.subject || '(no subject)';
  const me = state.settings.meAddresses[0];
  return createPortal(
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#000', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#555', marginBottom: 16 }}>
        <span>Mbox Viewer</span>
        {me && <span>{me}</span>}
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 'normal', margin: '0 0 4px' }}>{subject}</h1>
      <div style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>
        {loaded.items.length} message{loaded.items.length === 1 ? '' : 's'}
      </div>
      {loaded.items.map(({ m, p }) => (
        <PrintMessage key={m.id} m={m} p={p} />
      ))}
    </div>,
    document.getElementById('print-root')!,
  );
}
