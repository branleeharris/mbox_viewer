import { Icon, type IconName } from './Icon';
import { Logo } from './TopBar';

export function Welcome() {
  return (
    <div className="flex min-h-full flex-col bg-app">
      <header className="flex h-16 items-center px-4">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <h1 className="mb-2 text-center font-display text-[32px] text-ink">Open your mail archive</h1>
          <p className="mb-8 text-center text-ink-2">
            Read, search and export <b>.mbox</b> files with an inbox you already know how to use.
          </p>

          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('mv:open-files'))}
            className="group flex w-full flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-line-strong bg-surface px-6 py-14 text-center transition-colors hover:border-accent hover:bg-accent-soft/30"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-compose text-compose-ink">
              <Icon name="upload_file" size={32} />
            </span>
            <span className="text-lg font-medium text-ink">Drop .mbox files here</span>
            <span className="text-sm text-ink-2">
              or <span className="font-medium text-accent group-hover:underline">choose files</span>. You can pick several to merge them into one mailbox.
            </span>
          </button>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {(
              [
              ['lock', 'Stays on this computer', 'Files are read in your browser. Nothing is uploaded anywhere.'],
              ['database', 'Opens instantly next time', 'Mail is saved in this browser until you clear it in Settings.'],
              ['inbox', 'Gmail labels & threads', 'Google Takeout labels, categories, stars and conversations carry over.'],
              ] as [IconName, string, string][]
            ).map(([icon, title, body]) => (
              <div key={title} className="rounded-2xl bg-surface p-4">
                <Icon name={icon} size={22} className="mb-2 text-accent" />
                <div className="mb-1 text-sm font-medium text-ink">{title}</div>
                <div className="text-xs leading-relaxed text-ink-2">{body}</div>
              </div>
            ))}
          </div>

          <details className="mt-6 rounded-2xl bg-surface p-4 text-sm text-ink-2">
            <summary className="cursor-pointer font-medium text-ink">How do I get an .mbox file from Gmail?</summary>
            <ol className="mt-3 list-decimal space-y-1 pl-5">
              <li>
                Go to <b>takeout.google.com</b> and choose <b>Deselect all</b>.
              </li>
              <li>
                Select <b>Mail</b> (optionally limit it to certain labels), then <b>Next step</b> → <b>Create export</b>.
              </li>
              <li>Download and unzip the archive when Google emails you.</li>
              <li>
                Open <code className="rounded bg-chip px-1">Takeout/Mail/All mail Including Spam and Trash.mbox</code> here.
              </li>
            </ol>
            <p className="mt-3">Exports from Thunderbird, Apple Mail and other clients work too, as do single .eml files.</p>
          </details>
        </div>
      </main>
    </div>
  );
}
