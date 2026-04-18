import { css, token } from '@vertz/ui';
import { useRouter } from '@vertz/ui/router';
import type { CommandItem } from './command-palette-utils';
import { STATIC_COMMANDS, filterCommands, nextIndex, prevIndex } from './command-palette-utils';

const s = css({
  overlay: {
    position: 'fixed',
    display: 'flex',
    inset: '0',
    zIndex: '100',
    '&': { justifyContent: 'center', paddingTop: '120px', background: 'rgba(0, 0, 0, 0.5)' },
  },
  dialog: {
    display: 'flex',
    flexDirection: 'column',
    borderRadius: token.radius.xl,
    overflow: 'hidden',
    '&': {
      width: '480px',
      maxHeight: '400px',
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      boxShadow: '0 16px 48px rgba(0, 0, 0, 0.2)',
    },
  },
  input: {
    fontSize: token.font.size.sm,
    color: token.color.foreground,
    width: '100%',
    '&': {
      height: '48px',
      padding: '0 16px',
      border: 'none',
      borderBottom: '1px solid var(--color-border)',
      background: 'transparent',
      outline: 'none',
    },
  },
  list: { padding: token.spacing[2], overflowY: 'auto', '&': { flex: '1' } },
  category: {
    fontWeight: token.font.weight.medium,
    color: token.color['muted-foreground'],
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    '&': { fontSize: '11px', padding: '8px 8px 4px' },
  },
  item: {
    borderRadius: token.radius.md,
    fontSize: token.font.size.sm,
    color: token.color.foreground,
    width: '100%',
    cursor: 'pointer',
    textAlign: 'left',
    '&': { padding: '8px 12px', display: 'block', border: 'none', background: 'transparent' },
  },
  itemActive: {
    borderRadius: token.radius.md,
    fontSize: token.font.size.sm,
    color: token.color.foreground,
    backgroundColor: token.color.secondary,
    width: '100%',
    cursor: 'pointer',
    textAlign: 'left',
    '&': { padding: '8px 12px', display: 'block', border: 'none' },
  },
  empty: {
    padding: token.spacing[4],
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    textAlign: 'center',
  },
});

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

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.dialog} onClick={(e: MouseEvent) => e.stopPropagation()}>
        <input
          className={s.input}
          placeholder="Type to search..."
          value={searchQuery}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          autofocus
        />
        <div className={s.list}>
          {filtered.length === 0 && <div className={s.empty}>No results found</div>}
          {filtered.map((item: CommandItem, i: number) => (
            <button
              key={item.href}
              className={i === activeIndex ? s.itemActive : s.item}
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
