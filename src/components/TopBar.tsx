import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { SearchBar } from './SearchBar';
import { IconButton, Menu } from './ui';
import { formatBytes } from '../lib/format';

export function Logo() {
  return (
    <a href="#inbox" className="flex shrink-0 items-center gap-2 pr-4 pl-1" aria-label="Mbox Viewer — Inbox">
      <svg width="34" height="26" viewBox="0 0 40 30" aria-hidden="true">
        <rect x="1" y="1" width="38" height="28" rx="5" fill="#0b57d0" />
        <path d="M5 6l15 11L35 6" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-[22px] text-ink-2">Mbox</span>
    </a>
  );
}

function AccountMenu() {
  const me = useStore((s) => s.settings.meAddresses);
  const total = useStore((s) => s.messages.size);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage({ usage: e.usage ?? 0, quota: e.quota ?? 0 })).catch(() => {});
  }, [total]);
  const addr = me[0] ?? '';
  return (
    <Menu
      align="right"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label="Mailbox info"
          title={addr || 'Mailbox info'}
          className="ml-1 flex h-10 w-10 items-center justify-center rounded-full hover:bg-hover"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1a73e8] text-sm font-medium text-white">
            {(addr[0] ?? 'M').toUpperCase()}
          </span>
        </button>
      )}
      items={[
        { label: addr ? addr : 'Owner address not detected', onSelect: () => useStore.setState({ settingsOpen: true }) },
        {
          label: `${total.toLocaleString()} messages${usage ? ` · ${formatBytes(usage.usage)} stored locally` : ''}`,
          onSelect: () => useStore.setState({ settingsOpen: true }),
        },
        'divider',
        { label: 'Open mbox files…', icon: 'upload_file', onSelect: () => window.dispatchEvent(new Event('mv:open-files')) },
        { label: 'Manage mailboxes', icon: 'database', onSelect: () => useStore.setState({ settingsOpen: true }) },
      ]}
    />
  );
}

export function TopBar() {
  const toggleSidebar = () => useStore.setState((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }));
  return (
    <header className="flex h-16 shrink-0 items-center gap-1 pr-2 pl-2">
      <IconButton icon="menu" label="Main menu" size={24} onClick={toggleSidebar} className="h-12 w-12" />
      <div className="hidden w-[200px] sm:block">
        <Logo />
      </div>
      <div className="flex min-w-0 flex-1 pl-2 lg:pl-6">
        <SearchBar />
      </div>
      <div className="flex shrink-0 items-center pl-2">
        <span className="hidden md:inline-flex">
          <IconButton icon="help" label="Keyboard shortcuts" size={24} onClick={() => useStore.setState({ shortcutsOpen: true })} />
        </span>
        <IconButton icon="settings" label="Settings" size={24} onClick={() => useStore.setState({ settingsOpen: true })} />
        <AccountMenu />
      </div>
    </header>
  );
}
