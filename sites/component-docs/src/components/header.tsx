import { Link } from '@vertz/ui/router';

export function Header() {
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
      </div>
    </header>
  );
}
