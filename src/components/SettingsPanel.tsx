import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import type { Density, ImagePolicy, ReadingPane, ThemeChoice } from '../lib/types';
import { formatBytes } from '../lib/format';
import { exportMbox, downloadBlob } from '../lib/export';
import { isSourceAvailable, sourceBlob } from '../lib/raw';
import { Icon } from './Icon';
import { IconButton, useDismiss } from './ui';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line px-6 py-4">
      <h3 className="mb-3 text-sm font-medium text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Radio<T extends string>({ name, value, current, label, onChange }: { name: string; value: T; current: T; label: string; onChange: (v: T) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1.5 text-sm text-ink">
      <input type="radio" name={name} checked={current === value} onChange={() => onChange(value)} className="h-4 w-4 accent-[var(--accent)]" />
      {label}
    </label>
  );
}

function MeAddresses() {
  const me = useStore((s) => s.settings.meAddresses);
  const [text, setText] = useState(me.join(', '));
  useEffect(() => setText(me.join(', ')), [me]);
  const save = () => {
    const list = [...new Set(text.split(/[\s,;]+/).map((a) => a.trim().toLowerCase()).filter((a) => a.includes('@')))];
    useStore.getState().updateSettings({ meAddresses: list });
  };
  return (
    <div>
      <p className="mb-2 text-xs text-ink-3">Shown as “me” in conversations. Detected automatically from Sent mail.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        rows={2}
        placeholder="you@example.com"
        className="w-full rounded border border-line-strong bg-transparent p-2 text-sm text-ink outline-none focus:border-accent"
      />
    </div>
  );
}

function Mailboxes() {
  const sources = useStore((s) => s.sources);
  const messages = useStore((s) => s.messages);
  const importing = useStore((s) => s.importing);
  const { removeSource, showToast } = useStore.getState();
  const list = [...sources.values()].sort((a, b) => a.importedAt - b.importedAt);

  const exportAll = async () => {
    const s = useStore.getState();
    showToast(`Preparing ${s.messages.size.toLocaleString()} messages…`);
    const r = await exportMbox([...s.messages.values()], s.sources, 'merged-mailbox.mbox');
    showToast(r.skipped ? `Exported ${r.exported.toLocaleString()}; ${r.skipped.toLocaleString()} skipped (file not stored).` : `Exported ${r.exported.toLocaleString()} messages`);
  };

  return (
    <div className="space-y-3">
      {list.length === 0 && <p className="text-sm text-ink-3">No mailboxes yet.</p>}
      {list.map((src) => {
        const available = isSourceAvailable(src);
        return (
          <div key={src.id} className="rounded-lg border border-line p-3">
            <div className="flex items-start gap-2">
              <Icon name="inbox" size={20} className="mt-0.5 text-ink-2" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink" title={src.name}>
                  {src.name}
                </div>
                <div className="text-xs text-ink-3">
                  {src.messageCount.toLocaleString()} messages · {formatBytes(src.size)}
                  {src.duplicateCount ? ` · ${src.duplicateCount.toLocaleString()} duplicates skipped` : ''}
                </div>
                <div className="mt-1 text-xs">
                  {!src.complete && !importing ? (
                    <span className="text-danger">Import was interrupted</span>
                  ) : src.persisted ? (
                    <span className="text-ink-3">Saved in this browser</span>
                  ) : (
                    <span className="text-warning-ink">{available ? 'Available until this tab closes' : 'Index only, re-open the file to read messages'}</span>
                  )}
                </div>
              </div>
              <IconButton
                dense
                icon="download"
                label="Download original file"
                disabled={!available}
                onClick={async () => {
                  try {
                    downloadBlob(await sourceBlob(src), src.name);
                  } catch (e) {
                    showToast((e as Error).message);
                  }
                }}
              />
              <IconButton
                dense
                icon="delete"
                label="Remove mailbox"
                disabled={!!importing}
                onClick={async () => {
                  if (!confirm(`Remove "${src.name}" and its ${src.messageCount.toLocaleString()} messages from this browser?`)) return;
                  await removeSource(src.id);
                  showToast(`Removed ${src.name}`);
                }}
              />
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('mv:open-files'))}
          className="flex items-center gap-2 rounded-full border border-line-strong px-4 py-1.5 text-sm font-medium text-accent hover:bg-hover"
        >
          <Icon name="add" size={18} /> Add mbox files
        </button>
        {list.length > 0 && (
          <button
            type="button"
            onClick={exportAll}
            disabled={!messages.size}
            className="flex items-center gap-2 rounded-full border border-line-strong px-4 py-1.5 text-sm font-medium text-accent hover:bg-hover"
            title="Download every message, de-duplicated, as one .mbox file"
          >
            <Icon name="download" size={18} /> Export merged .mbox
          </button>
        )}
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const open = useStore((s) => s.settingsOpen);
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => useStore.setState({ settingsOpen: false });
  useDismiss(ref, open, close);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/10">
      <aside
        ref={ref}
        aria-label="Quick settings"
        className="popover-shadow absolute top-0 right-0 bottom-0 flex w-[360px] max-w-full flex-col bg-surface text-ink"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line pr-2 pl-6">
          <h2 className="font-display text-lg">Quick settings</h2>
          <IconButton icon="close" label="Close settings" onClick={close} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title="Density">
            {(['default', 'comfortable', 'compact'] as Density[]).map((d) => (
              <Radio key={d} name="density" value={d} current={settings.density} onChange={(v) => update({ density: v })} label={d[0].toUpperCase() + d.slice(1)} />
            ))}
          </Section>
          <Section title="Theme">
            {(
              [
                ['system', 'Device default'],
                ['light', 'Light'],
                ['dark', 'Dark'],
              ] as [ThemeChoice, string][]
            ).map(([v, l]) => (
              <Radio key={v} name="theme" value={v} current={settings.theme} onChange={(t) => update({ theme: t })} label={l} />
            ))}
          </Section>
          <Section title="Reading pane">
            {(
              [
                ['none', 'No split'],
                ['right', 'Right of inbox'],
              ] as [ReadingPane, string][]
            ).map(([v, l]) => (
              <Radio key={v} name="pane" value={v} current={settings.readingPane} onChange={(p) => update({ readingPane: p })} label={l} />
            ))}
          </Section>
          <Section title="External images">
            {(
              [
                ['ask', 'Ask before displaying'],
                ['always', 'Always display'],
              ] as [ImagePolicy, string][]
            ).map(([v, l]) => (
              <Radio key={v} name="images" value={v} current={settings.imagePolicy} onChange={(p) => update({ imagePolicy: p })} label={l} />
            ))}
            <p className="mt-1 text-xs text-ink-3">Loading remote images can tell senders when and where a message was opened.</p>
            {settings.trustedImageSenders.length > 0 && (
              <button type="button" className="mt-2 text-xs text-accent hover:underline" onClick={() => update({ trustedImageSenders: [] })}>
                Forget {settings.trustedImageSenders.length} trusted sender{settings.trustedImageSenders.length === 1 ? '' : 's'}
              </button>
            )}
          </Section>
          <Section title="Conversations per page">
            <select
              value={settings.pageSize}
              onChange={(e) => update({ pageSize: Number(e.target.value) })}
              className="rounded border border-line-strong bg-surface px-2 py-1 text-sm text-ink"
              aria-label="Conversations per page"
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Section>
          <Section title="Your email addresses">
            <MeAddresses />
          </Section>
          <Section title="Mailboxes">
            <Mailboxes />
          </Section>
          <section className="px-6 py-4">
            <button
              type="button"
              onClick={async () => {
                if (!confirm('Delete every mailbox, message and setting stored by this app in this browser?')) return;
                await useStore.getState().clearAll();
                useStore.getState().showToast('All local data was deleted');
              }}
              className="flex items-center gap-2 rounded-full border border-danger px-4 py-1.5 text-sm font-medium text-danger hover:bg-hover"
            >
              <Icon name="delete_forever" size={18} /> Clear all data
            </button>
            <p className="mt-2 text-xs text-ink-3">Removes everything this app stored in this browser. Your original files are not touched.</p>
          </section>
        </div>
      </aside>
    </div>
  );
}
