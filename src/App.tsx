import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { parseHash, viewTitle } from './lib/router';
import { useListController } from './hooks/useListController';
import { useShortcuts } from './hooks/useShortcuts';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { MailList } from './components/MailList';
import { ThreadView } from './components/ThreadView';
import { PeopleTimeline } from './components/PeopleTimeline';
import { Welcome } from './components/Welcome';
import { ImportStatus, Toast, DropOverlay } from './components/StatusLayer';
import { SettingsPanel } from './components/SettingsPanel';
import { ShortcutsDialog, OriginalMessage, PrintView, UnloadDialog } from './components/Overlays';
import { Icon } from './components/Icon';

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

function useWide(min: number) {
  const [wide, setWide] = useState(() => window.innerWidth >= min);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= min);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [min]);
  return wide;
}

function useDocumentTitle() {
  const view = useStore((s) => s.route.view);
  const unread = useStore((s) => s.counts.unread.get('inbox'));
  const me = useStore((s) => s.settings.meAddresses[0]);
  useEffect(() => {
    const title = view.kind === 'search' ? `Search results` : viewTitle(view);
    const count = view.kind === 'folder' && view.folder === 'inbox' && unread ? ` (${unread.toLocaleString()})` : '';
    document.title = [title + count, me, 'Mbox'].filter(Boolean).join(' - ');
  }, [view, unread, me]);
}

function FilePicker() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const open = () => input.current?.click();
    window.addEventListener('mv:open-files', open);
    return () => window.removeEventListener('mv:open-files', open);
  }, []);
  return (
    <input
      ref={input}
      type="file"
      multiple
      className="hidden"
      aria-hidden="true"
      tabIndex={-1}
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = '';
        useStore.getState().importFiles(files);
      }}
    />
  );
}

function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-app">
      <svg width="64" height="48" viewBox="0 0 40 30" aria-hidden="true">
        <rect x="1" y="1" width="38" height="28" rx="5" fill="#0b57d0" />
        <path d="M5 6l15 11L35 6" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="relative h-1 w-48 overflow-hidden rounded-full bg-accent-soft">
        <div className="animate-indeterminate absolute inset-y-0 w-2/5 rounded-full bg-accent" />
      </div>
    </div>
  );
}

function Shell() {
  const threadId = useStore((s) => s.route.threadId);
  const view = useStore((s) => s.route.view);
  const pane = useStore((s) => s.settings.readingPane);
  const wide = useWide(1024);
  const roomy = useWide(700);
  // The people timeline has no message list, so it never splits.
  const people = view.kind === 'people' ? view : null;
  const split = pane === 'right' && wide && !people;

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="mr-4 mb-4 min-w-0 flex-1 overflow-hidden rounded-2xl bg-surface max-sm:mr-0 max-sm:mb-0 max-sm:rounded-none">
          {split ? (
            <div className="flex h-full">
              <div className="w-[42%] max-w-[640px] min-w-[360px] border-r border-line">
                <MailList split />
              </div>
              <div className="min-w-0 flex-1">
                {threadId ? (
                  <ThreadView threadId={threadId} split />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-ink-3">
                    <Icon name="mail" size={48} className="text-line-strong" />
                    No conversation selected
                  </div>
                )}
              </div>
            </div>
          ) : threadId ? (
            <ThreadView threadId={threadId} split={false} />
          ) : people ? (
            <PeopleTimeline view={people} />
          ) : (
            // Phones get Gmail's three-line rows.
            <MailList split={!roomy} />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const ready = useStore((s) => s.ready);
  const fatal = useStore((s) => s.fatal);
  const hasMail = useStore((s) => s.messages.size > 0);
  const importing = useStore((s) => !!s.importing);

  useTheme();
  useDocumentTitle();
  useListController();
  useShortcuts();

  useEffect(() => {
    void useStore.getState().init();
    const onHash = () => useStore.getState().setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  let body;
  if (!ready) body = <Splash />;
  else if (fatal)
    body = (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-2">
        <div>
          <p className="mb-2 text-base text-ink">The mailbox database couldn't be opened.</p>
          <p className="mb-4">{fatal}</p>
          <p>Private browsing windows and some browser settings block local storage.</p>
        </div>
      </div>
    );
  else if (!hasMail && !importing) body = <Welcome />;
  else body = <Shell />;

  return (
    <>
      {body}
      <FilePicker />
      <DropOverlay />
      <ImportStatus />
      <Toast />
      <SettingsPanel />
      <ShortcutsDialog />
      <OriginalMessage />
      <PrintView />
      <UnloadDialog />
    </>
  );
}
