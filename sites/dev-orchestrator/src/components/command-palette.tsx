import { useRouter } from '@vertz/ui/router';
import type { CommandItem } from './command-palette-utils';
import { STATIC_COMMANDS, filterCommands, nextIndex, prevIndex } from './command-palette-utils';

const s = {
  overlay: {
    position: 'fixed' as const,
    inset: '0',
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    paddingTop: '120px',
    zIndex: '100',
  },
  dialog: {
    width: '480px',
    maxHeight: '400px',
    background: 'var(--color-card)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.2)',
  },
  input: {
    width: '100%',
    height: '48px',
    padding: '0 16px',
    border: 'none',
    borderBottom: '1px solid var(--color-border)',
    background: 'transparent',
    color: 'var(--color-foreground)',
    fontSize: '14px',
    outline: 'none',
  },
  list: {
    flex: '1',
    overflowY: 'auto' as const,
    padding: '8px',
  },
  category: {
    fontSize: '11px',
    fontWeight: '500' as const,
    color: 'var(--color-muted-foreground)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    padding: '8px 8px 4px',
  },
  item: {
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    color: 'var(--color-foreground)',
    cursor: 'pointer',
    display: 'block',
    width: '100%',
    border: 'none',
    background: 'transparent',
    textAlign: 'left' as const,
  },
  itemActive: {
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    color: 'var(--color-foreground)',
    cursor: 'pointer',
    display: 'block',
    width: '100%',
    border: 'none',
    background: 'var(--color-secondary)',
    textAlign: 'left' as const,
  },
  empty: {
    padding: '16px',
    textAlign: 'center' as const,
    fontSize: '13px',
    color: 'var(--color-muted-foreground)',
  },
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { navigate } = useRouter();
  let searchQuery = '';
  let activeIndex = 0;

  const filtered = filterCommands(STATIC_COMMANDS, searchQuery);

  const selectItem = (item: CommandItem) => {
    onClose();
    navigate({ to: item.href });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const items = filterCommands(STATIC_COMMANDS, searchQuery);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = nextIndex(activeIndex, items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = prevIndex(activeIndex, items.length);
    } else if (e.key === 'Enter' && items[activeIndex]) {
      e.preventDefault();
      selectItem(items[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleInput = (e: Event) => {
    searchQuery = (e.target as HTMLInputElement).value;
    activeIndex = 0;
  };

  if (!open) return null;

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.dialog} onClick={(e: MouseEvent) => e.stopPropagation()}>
        <input
          style={s.input}
          placeholder="Type to search..."
          value={searchQuery}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          autofocus
        />
        <div style={s.list}>
          {filtered.length === 0 && (
            <div style={s.empty}>No results found</div>
          )}
          {filtered.map((item: CommandItem, i: number) => (
            <button
              key={item.href}
              style={i === activeIndex ? s.itemActive : s.item}
              onClick={() => selectItem(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
