import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { Icon } from './Icon';
import { IconButton, useDismiss } from './ui';

function quoteIfNeeded(v: string) {
  const t = v.trim();
  return /\s/.test(t) && !/^".*"$/.test(t) ? `"${t}"` : t;
}

const WITHIN = [
  ['1d', '1 day'],
  ['3d', '3 days'],
  ['7d', '1 week'],
  ['14d', '2 weeks'],
  ['1m', '1 month'],
  ['2m', '2 months'],
  ['6m', '6 months'],
  ['1y', '1 year'],
] as const;

function shiftDate(base: Date, code: string, sign: number): Date {
  const d = new Date(base);
  const n = parseInt(code, 10) * sign;
  if (code.endsWith('d')) d.setDate(d.getDate() + n);
  else if (code.endsWith('m')) d.setMonth(d.getMonth() + n);
  else d.setFullYear(d.getFullYear() + n);
  return d;
}

const ymd = (d: Date) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;

export function SearchBar() {
  const route = useStore((s) => s.route);
  const userLabels = useStore((s) => s.counts.userLabels);
  const current = route.view.kind === 'search' ? route.view.query : '';
  const [q, setQ] = useState(current);
  const [focused, setFocused] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(wrap, advanced, () => setAdvanced(false));

  useEffect(() => setQ(current), [current]);

  useEffect(() => {
    const focus = () => input.current?.focus();
    window.addEventListener('mv:focus-search', focus);
    return () => window.removeEventListener('mv:focus-search', focus);
  }, []);

  const run = (query: string) => {
    const t = query.trim();
    setAdvanced(false);
    input.current?.blur();
    location.hash = t ? '#search/' + encodeURIComponent(t) : '#inbox';
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(q);
  };

  // Advanced search form state
  const [f, setF] = useState({
    from: '',
    to: '',
    subject: '',
    words: '',
    without: '',
    sizeOp: 'larger',
    size: '',
    sizeUnit: 'M',
    within: '',
    date: '',
    scope: 'all',
    attachment: false,
  });
  const upd = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  const buildAdvanced = () => {
    const parts: string[] = [];
    if (f.from.trim()) parts.push(`from:${quoteIfNeeded(f.from)}`);
    if (f.to.trim()) parts.push(`to:${quoteIfNeeded(f.to)}`);
    if (f.subject.trim()) parts.push(`subject:${quoteIfNeeded(f.subject)}`);
    if (f.words.trim()) parts.push(f.words.trim());
    if (f.without.trim()) parts.push(...f.without.trim().split(/\s+/).map((w) => `-${w}`));
    if (f.size.trim()) parts.push(`${f.sizeOp}:${f.size.trim()}${f.sizeUnit === 'B' ? '' : f.sizeUnit}`);
    if (f.within && f.date) {
      const base = new Date(f.date + 'T00:00:00');
      parts.push(`after:${ymd(shiftDate(base, f.within, -1))}`, `before:${ymd(shiftDate(base, f.within, 1))}`);
    }
    if (f.scope === 'anywhere') parts.push('in:anywhere');
    else if (f.scope.startsWith('label:')) parts.push(`label:${quoteIfNeeded(f.scope.slice(6))}`);
    else if (f.scope !== 'all') parts.push(`in:${f.scope}`);
    if (f.attachment) parts.push('has:attachment');
    return parts.join(' ');
  };

  const field = 'w-full border-0 border-b border-line-strong bg-transparent py-1.5 text-sm text-ink outline-none focus:border-accent';

  return (
    <div ref={wrap} className="relative w-full max-w-[720px]">
      <form
        onSubmit={onSubmit}
        className={`flex h-12 items-center rounded-full px-1 transition-colors ${focused || advanced ? 'popover-shadow bg-popover' : 'bg-search'}`}
        role="search"
      >
        <IconButton icon="search" label="Search mail" type="submit" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              input.current?.blur();
            }
          }}
          placeholder="Search mail"
          aria-label="Search mail"
          className="h-full min-w-0 flex-1 bg-transparent px-1 text-base text-ink placeholder:text-ink-2 outline-none"
          spellCheck={false}
        />
        {q && (
          <IconButton
            icon="close"
            label="Clear search"
            onClick={() => {
              setQ('');
              if (current) location.hash = '#inbox';
              input.current?.focus();
            }}
          />
        )}
        <IconButton icon="tune" label="Show search options" onClick={() => setAdvanced((a) => !a)} />
      </form>

      {advanced && (
        <div className="popover-shadow absolute top-full right-0 left-0 z-50 mt-1 rounded-lg bg-popover p-6 text-sm text-ink">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const query = buildAdvanced();
              setQ(query);
              run(query);
            }}
            className="grid grid-cols-[140px_1fr] items-center gap-x-4 gap-y-3"
          >
            <label htmlFor="adv-from">From</label>
            <input id="adv-from" className={field} value={f.from} onChange={(e) => upd({ from: e.target.value })} autoFocus />
            <label htmlFor="adv-to">To</label>
            <input id="adv-to" className={field} value={f.to} onChange={(e) => upd({ to: e.target.value })} />
            <label htmlFor="adv-subject">Subject</label>
            <input id="adv-subject" className={field} value={f.subject} onChange={(e) => upd({ subject: e.target.value })} />
            <label htmlFor="adv-words">Has the words</label>
            <input id="adv-words" className={field} value={f.words} onChange={(e) => upd({ words: e.target.value })} />
            <label htmlFor="adv-without">Doesn't have</label>
            <input id="adv-without" className={field} value={f.without} onChange={(e) => upd({ without: e.target.value })} />
            <span>Size</span>
            <div className="flex gap-3">
              <select aria-label="Size comparison" className={field + ' w-36'} value={f.sizeOp} onChange={(e) => upd({ sizeOp: e.target.value })}>
                <option value="larger">greater than</option>
                <option value="smaller">less than</option>
              </select>
              <input aria-label="Size" className={field} inputMode="numeric" value={f.size} onChange={(e) => upd({ size: e.target.value.replace(/[^\d.]/g, '') })} />
              <select aria-label="Size unit" className={field + ' w-20'} value={f.sizeUnit} onChange={(e) => upd({ sizeUnit: e.target.value })}>
                <option value="M">MB</option>
                <option value="K">KB</option>
                <option value="B">Bytes</option>
              </select>
            </div>
            <span>Date within</span>
            <div className="flex gap-3">
              <select aria-label="Date range" className={field + ' w-36'} value={f.within} onChange={(e) => upd({ within: e.target.value })}>
                <option value="">Any time</option>
                {WITHIN.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <input aria-label="Date" type="date" className={field} value={f.date} onChange={(e) => upd({ date: e.target.value })} disabled={!f.within} />
            </div>
            <label htmlFor="adv-scope">Search</label>
            <select id="adv-scope" className={field} value={f.scope} onChange={(e) => upd({ scope: e.target.value })}>
              <option value="all">All Mail</option>
              <option value="inbox">Inbox</option>
              <option value="starred">Starred</option>
              <option value="sent">Sent Mail</option>
              <option value="drafts">Drafts</option>
              <option value="spam">Spam</option>
              <option value="trash">Trash</option>
              <option value="anywhere">Mail &amp; Spam &amp; Trash</option>
              <option value="unread">Unread Mail</option>
              {userLabels.map((l) => (
                <option key={l} value={'label:' + l}>
                  {l}
                </option>
              ))}
            </select>
            <span />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={f.attachment} onChange={(e) => upd({ attachment: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
              Has attachment
            </label>
            <div className="col-span-2 mt-2 flex justify-end">
              <button type="submit" className="flex items-center gap-2 rounded-full bg-accent px-6 py-2 font-medium text-surface hover:shadow">
                <Icon name="search" size={18} /> Search
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
