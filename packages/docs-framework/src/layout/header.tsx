import type { NavbarConfig } from '../config/types';

export interface HeaderProps {
  name: string;
  navbar?: NavbarConfig;
}

function NavLink({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      style={{
        fontSize: '14px',
        textDecoration: 'none',
        color: 'var(--docs-text, #374151)',
      }}
    >
      {label}
    </a>
  );
}

function CtaButton({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      data-cta
      style={{
        fontSize: '14px',
        fontWeight: '500',
        textDecoration: 'none',
        padding: '6px 16px',
        borderRadius: '6px',
        color: 'white',
        backgroundColor: 'var(--docs-primary, #2563eb)',
      }}
    >
      {label}
    </a>
  );
}

export function Header({ name, navbar }: HeaderProps) {
  return (
    <header
      style={{
        position: 'sticky',
        top: '0',
        zIndex: '50',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        height: '56px',
        borderBottom: '1px solid var(--docs-border, #e5e7eb)',
        backgroundColor: 'var(--docs-bg, #ffffff)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <a
          href="/"
          style={{
            fontSize: '18px',
            fontWeight: '700',
            textDecoration: 'none',
            color: 'var(--docs-text, #111827)',
          }}
        >
          {name}
        </a>
        {navbar?.links && (
          <nav style={{ display: 'flex', gap: '16px' }}>
            {navbar.links.map((link) => (
              <NavLink label={link.label} href={link.href} />
            ))}
          </nav>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {navbar?.cta && <CtaButton label={navbar.cta.label} href={navbar.cta.href} />}
      </div>
    </header>
  );
}
