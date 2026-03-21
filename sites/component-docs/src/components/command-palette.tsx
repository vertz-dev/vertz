import { onCleanup } from '@vertz/ui';
import { useRouter } from '@vertz/ui/router';
import { components } from '../manifest';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

function getFilteredComponents(query: string) {
  if (!query) return components;
  return components.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()));
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  let query = '';
  let selectedIndex = 0;

  const filtered = getFilteredComponents(query);

  const { navigate } = useRouter();

  function selectItem(index: number) {
    const item = filtered[index];
    if (item) {
      navigate({ to: `/components/${item.name}` });
      query = '';
      selectedIndex = 0;
      onClose();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    // Only handle when palette is visible
    const backdrop = document.querySelector('[data-backdrop]') as HTMLElement;
    if (!backdrop || backdrop.style.display === 'none') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectItem(selectedIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  // Component-scoped listener with cleanup — no duplicates on re-mount
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', handleKeyDown, true);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown, true));
  }

  function handleInput(e: Event) {
    query = (e.target as HTMLInputElement).value;
    selectedIndex = 0;
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).dataset.backdrop) {
      onClose();
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay dismissal
    <div
      role="presentation"
      data-backdrop="true"
      onClick={handleBackdropClick}
      style={{
        display: open ? 'flex' : 'none',
        position: 'fixed',
        inset: '0',
        zIndex: '100',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '500px',
          backgroundColor: 'var(--color-background)',
          border: '1px solid var(--color-border)',
          borderRadius: '12px',
          boxShadow: '0 16px 70px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 15 15"
            fill="none"
            aria-hidden="true"
            style={{ flexShrink: '0', color: 'var(--color-muted-foreground)' }}
          >
            <path
              d="M10 6.5C10 8.433 8.433 10 6.5 10C4.567 10 3 8.433 3 6.5C3 4.567 4.567 3 6.5 3C8.433 3 10 4.567 10 6.5ZM9.30884 10.0159C8.53901 10.6318 7.56251 11 6.5 11C4.01472 11 2 8.98528 2 6.5C2 4.01472 4.01472 2 6.5 2C8.98528 2 11 4.01472 11 6.5C11 7.56251 10.6318 8.53901 10.0159 9.30884L12.8536 12.1464C13.0488 12.3417 13.0488 12.6583 12.8536 12.8536C12.6583 13.0488 12.3417 13.0488 12.1464 12.8536L9.30884 10.0159Z"
              fill="currentColor"
              fill-rule="evenodd"
              clip-rule="evenodd"
            />
          </svg>
          <input
            type="text"
            data-cmd-input=""
            placeholder="Search components..."
            onInput={handleInput}
            style={{
              flex: '1',
              border: 'none',
              outline: 'none',
              backgroundColor: 'transparent',
              color: 'var(--color-foreground)',
              fontSize: '14px',
              fontFamily: 'inherit',
            }}
          />
        </div>
        <div
          data-cmd-list=""
          style={{
            maxHeight: '300px',
            overflowY: 'auto',
            padding: '8px',
          }}
        >
          {filtered.length === 0 && (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: 'var(--color-muted-foreground)',
                fontSize: '14px',
              }}
            >
              No results found.
            </div>
          )}
          {filtered.map((entry, i) => (
            <button
              type="button"
              className="cmd-item"
              data-selected={i === selectedIndex ? 'true' : undefined}
              onClick={() => selectItem(i)}
            >
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--color-muted-foreground)',
                  minWidth: '80px',
                }}
              >
                {entry.category}
              </span>
              {entry.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
