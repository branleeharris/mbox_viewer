import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Icon, type IconName } from './Icon';
import { SYSTEM_FOLDERS, CATEGORIES, labelColor } from '../lib/labels';
import { viewToHash, sameView, type View } from '../lib/router';

interface NavItemProps {
  icon: IconName;
  label: string;
  view: View;
  count?: number;
  countBold?: boolean;
  depth?: number;
  collapsed: boolean;
  iconColor?: { light: string; dark: string };
  expander?: { open: boolean; toggle: () => void };
}

function NavItem({ icon, label, view, count, countBold = true, depth = 0, collapsed, iconColor, expander }: NavItemProps) {
  const current = useStore((s) => s.route.view);
  const active = sameView(current, view);
  const bold = active || (countBold && !!count);
  return (
    <a
      href={viewToHash(view)}
      title={collapsed ? `${label}${count ? ` (${count})` : ''}` : label}
      aria-current={active ? 'page' : undefined}
      onClick={() => {
        if (window.innerWidth < 640) useStore.setState({ sidebarCollapsed: true });
      }}
      className={`group relative flex h-8 items-center rounded-full text-sm ${collapsed ? 'mx-auto w-14 justify-center' : 'mr-4 pr-3'} ${active ? 'bg-nav-active text-nav-active-ink' : 'text-ink hover:bg-hover'} ${bold ? 'font-bold' : ''}`}
      style={collapsed ? undefined : { paddingLeft: 26 + depth * 12 }}
    >
      {!collapsed && expander && (
        <span
          role="button"
          aria-label={expander.open ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            expander.toggle();
          }}
          className="absolute flex h-6 w-6 items-center justify-center rounded-full text-ink-2 hover:bg-hover"
          style={{ left: 2 + depth * 12 }}
        >
          <Icon name={expander.open ? 'keyboard_arrow_down' : 'keyboard_arrow_right'} size={18} />
        </span>
      )}
      <Icon
        name={icon}
        size={20}
        filled={active && icon !== 'stacks'}
        className={iconColor ? 'text-[var(--lc)] dark:text-[var(--lc-dark)]' : ''}
        style={iconColor ? ({ '--lc': iconColor.light, '--lc-dark': iconColor.dark } as React.CSSProperties) : undefined}
      />
      {!collapsed && (
        <>
          <span className="ml-4 flex-1 truncate">{label}</span>
          {!!count && <span className={`ml-2 text-xs ${bold ? 'font-bold' : 'font-normal'}`}>{count.toLocaleString()}</span>}
        </>
      )}
      {collapsed && !!count && countBold && (
        <span className="absolute top-0 right-1 rounded-full bg-accent px-1 text-[10px] leading-4 font-medium text-surface">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </a>
  );
}

interface LabelNode {
  name: string;
  path: string;
  exists: boolean;
  children: LabelNode[];
}

function buildTree(labels: string[]): LabelNode[] {
  const root: LabelNode = { name: '', path: '', exists: false, children: [] };
  for (const l of labels) {
    const parts = l.split('/');
    let node = root;
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/');
      let child = node.children.find((c) => c.path === path);
      if (!child) node.children.push((child = { name: part, path, exists: false, children: [] }));
      if (i === parts.length - 1) child.exists = true;
      node = child;
    });
  }
  return root.children;
}

function LabelTree({ nodes, depth, collapsed }: { nodes: LabelNode[]; depth: number; collapsed: boolean }) {
  const unread = useStore((s) => s.counts.unread);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <>
      {nodes.map((n) => {
        const isOpen = open[n.path] ?? false;
        return (
          <div key={n.path}>
            <NavItem
              icon="label"
              label={n.name}
              view={{ kind: 'label', label: n.path }}
              count={unread.get('label:' + n.path)}
              depth={depth}
              collapsed={collapsed}
              iconColor={{ light: labelColor(n.path).fg, dark: labelColor(n.path).bg }}
              expander={n.children.length ? { open: isOpen, toggle: () => setOpen((o) => ({ ...o, [n.path]: !isOpen })) } : undefined}
            />
            {isOpen && !collapsed && <LabelTree nodes={n.children} depth={depth + 1} collapsed={collapsed} />}
          </div>
        );
      })}
    </>
  );
}

export function Sidebar() {
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const counts = useStore((s) => s.counts);
  const view = useStore((s) => s.route.view);
  const [more, setMore] = useState(false);
  const [cats, setCats] = useState(false);
  const tree = useMemo(() => buildTree(counts.userLabels), [counts.userLabels]);

  const primary = ['inbox', 'starred', 'sent', 'drafts'];
  const folders = SYSTEM_FOLDERS.filter((f) => f.id !== 'chats' || counts.total.get('chats'));
  const shown = folders.filter((f) => primary.includes(f.id));
  const hidden = folders.filter((f) => !primary.includes(f.id));
  // Keep the active folder visible even when "More" is closed.
  const activeHidden = view.kind === 'folder' && hidden.some((f) => f.id === view.folder);
  const showMore = more || activeHidden || view.kind === 'category';

  const countFor = (id: string) => (id === 'drafts' ? counts.total.get(id) : id === 'sent' || id === 'trash' || id === 'all' ? undefined : counts.unread.get(id));

  return (
    <>
      {!collapsed && (
        <div className="fixed inset-0 z-30 bg-scrim sm:hidden" onClick={() => useStore.setState({ sidebarCollapsed: true })} />
      )}
      <nav
        aria-label="Mailboxes"
        className={`shrink-0 overflow-y-auto pb-6 ${collapsed ? 'hidden w-[72px] sm:block' : 'fixed inset-y-0 left-0 z-40 w-[256px] bg-app pt-2 sm:static sm:z-auto sm:bg-transparent sm:pt-0'}`}
      >
        <div className={`mb-4 ${collapsed ? 'flex justify-center' : 'pl-2'}`}>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('mv:open-files'))}
            title="Open mbox files"
            className={`flex h-14 items-center rounded-2xl bg-compose text-compose-ink transition-shadow hover:shadow-md ${collapsed ? 'w-14 justify-center' : 'gap-3 pr-6 pl-4'}`}
          >
            <Icon name="upload_file" size={24} />
            {!collapsed && <span className="text-sm font-medium">Open mbox</span>}
          </button>
        </div>

        {shown.map((f) => (
          <NavItem
            key={f.id}
            icon={f.icon}
            label={f.label}
            view={{ kind: 'folder', folder: f.id }}
            count={countFor(f.id)}
            countBold={f.id !== 'drafts'}
            collapsed={collapsed}
          />
        ))}

        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          className={`flex h-8 items-center rounded-full text-sm text-ink hover:bg-hover ${collapsed ? 'mx-auto w-14 justify-center' : 'mr-4 w-[calc(100%-16px)] pl-[26px]'}`}
          title={showMore ? 'Less' : 'More'}
        >
          <Icon name={showMore ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} size={20} />
          {!collapsed && <span className="ml-4">{showMore ? 'Less' : 'More'}</span>}
        </button>

        {showMore && (
          <>
            {hidden.map((f) => (
              <NavItem
                key={f.id}
                icon={f.icon}
                label={f.label}
                view={{ kind: 'folder', folder: f.id }}
                count={countFor(f.id)}
                collapsed={collapsed}
              />
            ))}
            {counts.tabs && (
              <>
                <button
                  type="button"
                  onClick={() => setCats((c) => !c)}
                  className={`flex h-8 items-center rounded-full text-sm text-ink hover:bg-hover ${collapsed ? 'mx-auto w-14 justify-center' : 'mr-4 w-[calc(100%-16px)] pl-[26px]'}`}
                  title="Categories"
                >
                  <Icon name="category" size={20} />
                  {!collapsed && <span className="ml-4 flex-1 text-left">Categories</span>}
                </button>
                {(cats || view.kind === 'category') &&
                  CATEGORIES.filter((c) => c.id !== 'primary').map((c) => (
                    <NavItem
                      key={c.id}
                      icon={c.icon}
                      label={c.label}
                      view={{ kind: 'category', category: c.id }}
                      count={counts.unread.get(c.id)}
                      depth={1}
                      collapsed={collapsed}
                    />
                  ))}
              </>
            )}
          </>
        )}

        {tree.length > 0 && (
          <>
            {!collapsed ? (
              <h3 className="mt-4 mb-1 pr-4 pl-[26px] font-display text-base text-ink">Labels</h3>
            ) : (
              <div className="mx-4 my-3 border-t border-line" />
            )}
            <LabelTree nodes={tree} depth={0} collapsed={collapsed} />
          </>
        )}
      </nav>
    </>
  );
}
