import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { formatBytes } from '../lib/format';
import { Icon } from './Icon';
import { IconButton } from './ui';

export function ImportStatus() {
  const p = useStore((s) => s.importing);
  const warnings = useStore((s) => s.importWarnings);
  const [min, setMin] = useState(false);
  if (!p) return null;
  const pct = p.totalBytes ? Math.min(100, (p.bytesRead / p.totalBytes) * 100) : 0;
  return (
    <div className="popover-shadow fixed right-4 bottom-4 z-50 w-[360px] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg bg-popover text-ink" role="status" aria-live="polite">
      <div className="flex items-center gap-2 bg-[#202124] py-2 pr-1 pl-4 text-sm text-white dark:bg-black">
        <span className="flex-1 truncate">
          Importing {p.fileCount > 1 ? `file ${p.fileIndex + 1} of ${p.fileCount}` : p.fileName}
        </span>
        <IconButton dense icon={min ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} label={min ? 'Expand' : 'Minimize'} className="text-white hover:bg-white/10" onClick={() => setMin((m) => !m)} />
        <IconButton dense icon="close" label="Stop import" className="text-white hover:bg-white/10" onClick={() => useStore.getState().cancelImport()} />
      </div>
      {!min && (
        <div className="p-4 text-sm">
          <div className="mb-1 flex justify-between text-ink-2">
            <span className="truncate pr-2">{p.fileName}</span>
            <span>{Math.floor(pct)}%</span>
          </div>
          <div className="mb-2 h-1 overflow-hidden rounded-full bg-accent-soft">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-ink-3">
            {formatBytes(p.bytesRead)} of {formatBytes(p.totalBytes)} · {p.messages.toLocaleString()} messages
            {p.duplicates ? ` · ${p.duplicates.toLocaleString()} duplicates skipped` : ''}
          </div>
          <div className="mt-1 text-xs text-ink-3">You can start reading while the rest loads.</div>
          {warnings.map((w, i) => (
            <div key={i} className="mt-3 flex gap-2 rounded bg-warning-bg p-2 text-xs text-warning-ink">
              <Icon name="warning" size={16} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role="status"
      aria-live="polite"
      className="animate-toast fixed bottom-6 left-6 z-[80] flex max-w-[min(560px,calc(100vw-48px))] items-center gap-4 rounded bg-toast py-3 pr-2 pl-6 text-sm text-toast-ink shadow-lg"
    >
      <span className="flex-1">{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          className="rounded px-2 py-1 font-medium text-[#a8c7fa] hover:bg-white/10 dark:text-accent-soft"
          onClick={() => {
            toast.action!.run();
            useStore.setState({ toast: null });
          }}
        >
          {toast.action.label}
        </button>
      )}
      <IconButton dense icon="close" label="Dismiss" className="text-toast-ink hover:bg-white/10" onClick={() => useStore.setState({ toast: null })} />
    </div>
  );
}

/** Full-window drop target shown while dragging files over the app. */
export function DropOverlay() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setActive(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setActive(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setActive(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) useStore.getState().importFiles(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);
  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-accent/20 p-6 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-accent bg-surface px-16 py-12 text-ink shadow-xl">
        <Icon name="upload_file" size={40} className="text-accent" />
        <span className="text-lg font-medium">Drop to add to your mailbox</span>
      </div>
    </div>
  );
}
