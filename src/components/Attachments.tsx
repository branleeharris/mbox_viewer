import { useEffect, useState } from 'react';
import type { Attachment } from 'postal-mime';
import { Icon, type IconName } from './Icon';
import { IconButton } from './ui';
import { downloadBlob } from '../lib/export';
import { formatBytes, safeFilename } from '../lib/format';

// Raster formats only: SVG can carry script, so it's never rendered inline.
const PREVIEWABLE_IMAGE = /^image\/(png|jpe?g|gif|webp|bmp|avif|x-icon|vnd\.microsoft\.icon)$/;

function attachmentName(a: Attachment, i: number) {
  return a.filename || `attachment-${i + 1}`;
}

function iconFor(type: string): { icon: IconName; color: string } {
  if (type === 'application/pdf') return { icon: 'picture_as_pdf', color: '#d93025' };
  if (type.startsWith('image/')) return { icon: 'image', color: '#d93025' };
  if (/zip|compressed|tar|rar|7z/.test(type)) return { icon: 'folder_zip', color: '#5f6368' };
  if (/sheet|excel|csv/.test(type)) return { icon: 'article', color: '#188038' };
  if (/presentation|powerpoint/.test(type)) return { icon: 'article', color: '#e37400' };
  if (type === 'text/calendar') return { icon: 'calendar_month', color: '#1a73e8' };
  if (type === 'message/rfc822') return { icon: 'mail', color: '#5f6368' };
  return { icon: 'description', color: '#1a73e8' };
}

function size(a: Attachment) {
  return typeof a.content === 'string' ? a.content.length : a.content.byteLength;
}

function toBlob(a: Attachment, inline: boolean) {
  // Anything not shown inline is typed as a generic download so the browser never renders it.
  return new Blob([a.content as BlobPart], { type: inline ? a.mimeType : 'application/octet-stream' });
}

export function Attachments({ attachments }: { attachments: Attachment[] }) {
  const [preview, setPreview] = useState<number | null>(null);
  // Created and revoked in one effect (StrictMode-safe).
  const [thumbs, setThumbs] = useState<(string | null)[]>([]);
  useEffect(() => {
    const urls = attachments.map((a) => (PREVIEWABLE_IMAGE.test(a.mimeType) ? URL.createObjectURL(toBlob(a, true)) : null));
    setThumbs(urls);
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [attachments]);

  if (!attachments.length) return null;
  const images = attachments.map((a, i) => ({ a, i })).filter(({ i }) => thumbs[i]);

  const open = (a: Attachment, i: number) => {
    if (thumbs[i]) setPreview(i);
    else if (a.mimeType === 'application/pdf') {
      const url = URL.createObjectURL(toBlob(a, true));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
    } else downloadBlob(toBlob(a, false), safeFilename(attachmentName(a, i)));
  };

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="mb-3 text-sm font-medium text-ink">
        {attachments.length} attachment{attachments.length === 1 ? '' : 's'}
      </div>
      <div className="flex flex-wrap gap-3">
        {attachments.map((a, i) => {
          const { icon, color } = iconFor(a.mimeType);
          const name = attachmentName(a, i);
          return (
            <div
              key={i}
              className="group relative h-[120px] w-[180px] cursor-pointer overflow-hidden rounded-lg border border-line bg-app"
              onClick={() => open(a, i)}
              title={`${name} (${formatBytes(size(a))})`}
            >
              {thumbs[i] ? (
                <img src={thumbs[i]!} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-[80px] items-center justify-center">
                  <Icon name={icon} size={40} style={{ color }} />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex h-10 items-center gap-2 border-t border-line bg-surface px-2">
                <Icon name={icon} size={18} style={{ color }} />
                <span className="truncate text-xs text-ink">{name}</span>
              </div>
              <div className="absolute inset-0 hidden flex-col justify-between bg-black/60 p-2 text-white group-hover:flex">
                <div>
                  <div className="truncate text-sm font-medium">{name}</div>
                  <div className="text-xs opacity-80">{formatBytes(size(a))}</div>
                </div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    aria-label={`Download ${name}`}
                    title="Download"
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadBlob(toBlob(a, false), safeFilename(name));
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 hover:bg-black/70"
                  >
                    <Icon name="download" size={20} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {preview !== null && (
        <Lightbox
          items={images.map(({ a, i }) => ({ url: thumbs[i]!, name: attachmentName(a, i), a }))}
          start={images.findIndex(({ i }) => i === preview)}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function Lightbox({
  items,
  start,
  onClose,
}: {
  items: { url: string; name: string; a: Attachment }[];
  start: number;
  onClose: () => void;
}) {
  const [i, setI] = useState(Math.max(0, start));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((n) => Math.min(items.length - 1, n + 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [items.length, onClose]);
  const item = items[i];
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/90 text-white" role="dialog" aria-modal="true" aria-label={item.name}>
      <div className="flex h-16 items-center gap-2 px-4">
        <IconButton icon="arrow_back" label="Close" onClick={onClose} className="text-white hover:bg-white/10" />
        <Icon name="image" size={20} className="text-[#ea4335]" />
        <span className="flex-1 truncate text-sm">{item.name}</span>
        <IconButton
          icon="download"
          label="Download"
          className="text-white hover:bg-white/10"
          onClick={() => downloadBlob(toBlob(item.a, false), safeFilename(item.name))}
        />
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-6" onClick={onClose}>
        <img src={item.url} alt={item.name} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        {i > 0 && (
          <IconButton
            icon="chevron_left"
            label="Previous"
            size={32}
            className="absolute left-4 h-14 w-14 bg-black/40 text-white hover:bg-black/70"
            onClick={(e) => {
              e.stopPropagation();
              setI(i - 1);
            }}
          />
        )}
        {i < items.length - 1 && (
          <IconButton
            icon="chevron_right"
            label="Next"
            size={32}
            className="absolute right-4 h-14 w-14 bg-black/40 text-white hover:bg-black/70"
            onClick={(e) => {
              e.stopPropagation();
              setI(i + 1);
            }}
          />
        )}
      </div>
    </div>
  );
}
