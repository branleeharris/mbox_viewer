import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type RefObject } from 'react';
import { Icon, type IconName } from './Icon';
import { avatarColor, initial } from '../lib/format';
import { labelColor } from '../lib/labels';
import type { Addr } from '../lib/types';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  size?: number;
  filled?: boolean;
  iconClassName?: string;
  dense?: boolean;
}

export function IconButton({ icon, label, size = 20, filled, iconClassName, dense, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-full text-ink-2 hover:bg-hover active:bg-press disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default ${dense ? 'h-8 w-8' : 'h-10 w-10'} ${className}`}
      {...rest}
    >
      <Icon name={icon} size={size} filled={filled} className={iconClassName} />
    </button>
  );
}

export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [ref, open, onClose]);
}

export interface MenuItem {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
}

interface MenuProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: (MenuItem | 'divider')[];
  align?: 'left' | 'right';
  className?: string;
}

export function Menu({ trigger, items, align = 'left', className = '' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [flipUp, setFlipUp] = useState(false);
  useDismiss(ref, open, () => setOpen(false));

  useLayoutEffect(() => {
    if (!open || !panel.current || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setFlipUp(r.bottom + panel.current.offsetHeight + 8 > window.innerHeight && r.top > panel.current.offsetHeight);
  }, [open]);

  return (
    <div ref={ref} className={`relative inline-flex ${className}`}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          ref={panel}
          role="menu"
          className={`popover-shadow absolute z-50 min-w-48 rounded-md bg-popover py-2 text-sm text-ink ${align === 'right' ? 'right-0' : 'left-0'} ${flipUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          {items.map((item, i) =>
            item === 'divider' ? (
              <div key={i} className="my-2 border-t border-line" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-3 px-4 py-1.5 text-left whitespace-nowrap hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent ${item.danger ? 'text-danger' : ''}`}
              >
                {item.icon && <Icon name={item.icon} size={20} className="text-ink-2" />}
                {item.checked !== undefined && (
                  <span className="w-5 text-accent">{item.checked ? '✓' : ''}</span>
                )}
                <span className="flex-1">{item.label}</span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function Avatar({ addr, size = 40 }: { addr: Addr; size?: number }) {
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 select-none items-center justify-center rounded-full font-medium text-white"
      style={{ width: size, height: size, background: avatarColor(addr.address || addr.name), fontSize: size * 0.45 }}
    >
      {initial(addr)}
    </div>
  );
}

export function LabelChip({ label, onClick }: { label: string; onClick?: () => void }) {
  const { bg, fg } = labelColor(label);
  return (
    <span
      onClick={
        onClick &&
        ((e) => {
          e.stopPropagation();
          onClick();
        })
      }
      title={label}
      className={`inline-flex max-w-40 shrink-0 items-center truncate rounded px-1.5 text-xs leading-5 ${onClick ? 'cursor-pointer hover:brightness-95' : ''}`}
      style={{ background: bg, color: fg }}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean, e: React.MouseEvent) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked, e);
      }}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-hover hover:text-ink"
    >
      <Icon
        size={20}
        name={indeterminate ? 'indeterminate_check_box' : checked ? 'check_box' : 'check_box_outline_blank'}
        filled={checked || indeterminate}
        className={checked || indeterminate ? 'text-ink' : ''}
      />
    </button>
  );
}

export function Dialog({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, true, onClose);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`popover-shadow flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-surface text-ink outline-none ${wide ? 'max-w-5xl' : 'max-w-lg'}`}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="font-display text-[22px] text-ink">{title}</h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}
