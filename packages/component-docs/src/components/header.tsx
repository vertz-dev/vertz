import { Link } from '@vertz/ui/router';
import { useTheme } from '../hooks/use-theme';
import { ThemeCustomizer } from './theme-customizer';

interface HeaderProps {
  onSearchOpen?: () => void;
}

export function Header({ onSearchOpen }: HeaderProps) {
  const { theme, toggle } = useTheme();

  return (
    <header
      style={{
        position: 'sticky',
        top: '0',
        zIndex: '50',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-background)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '56px',
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <Link href="/components/button">
            <span style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-foreground)' }}>
              Vertz UI
            </span>
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link href="/components/button">Components</Link>
            <a
              href="https://vertz.dev/docs"
              style={{ fontSize: '14px', color: 'var(--color-muted-foreground)' }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Docs
            </a>
            <a
              href="https://github.com/vertz-dev/vertz"
              style={{ fontSize: '14px', color: 'var(--color-muted-foreground)' }}
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Search trigger */}
          <button
            type="button"
            onClick={() => onSearchOpen?.()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              height: '36px',
              padding: '0 12px',
              fontSize: '14px',
              color: 'var(--color-muted-foreground)',
              backgroundColor: 'var(--color-muted)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              cursor: 'pointer',
              minWidth: '200px',
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 15 15"
              fill="none"
              style={{ flexShrink: '0' }}
              aria-hidden="true"
            >
              <path
                d="M10 6.5C10 8.433 8.433 10 6.5 10C4.567 10 3 8.433 3 6.5C3 4.567 4.567 3 6.5 3C8.433 3 10 4.567 10 6.5ZM9.30884 10.0159C8.53901 10.6318 7.56251 11 6.5 11C4.01472 11 2 8.98528 2 6.5C2 4.01472 4.01472 2 6.5 2C8.98528 2 11 4.01472 11 6.5C11 7.56251 10.6318 8.53901 10.0159 9.30884L12.8536 12.1464C13.0488 12.3417 13.0488 12.6583 12.8536 12.8536C12.6583 13.0488 12.3417 13.0488 12.1464 12.8536L9.30884 10.0159Z"
                fill="currentColor"
                fill-rule="evenodd"
                clip-rule="evenodd"
              />
            </svg>
            <span style={{ flex: '1', textAlign: 'left' }}>Search components...</span>
            <kbd
              style={{
                fontSize: '11px',
                fontFamily: 'inherit',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-background)',
                color: 'var(--color-muted-foreground)',
              }}
            >
              {'\u2318K'}
            </kbd>
          </button>

          {/* Theme customizer */}
          <ThemeCustomizer />

          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggle}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              backgroundColor: 'transparent',
              color: 'var(--color-foreground)',
              cursor: 'pointer',
            }}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
