import type { FooterLinkGroup, NavLink } from '../config/types';

export interface FooterProps {
  links?: FooterLinkGroup[];
  socials?: Record<string, string>;
}

function FooterGroupComponent({ title, items }: { title: string; items: NavLink[] }) {
  return (
    <div data-footer-group>
      <div
        style={{
          fontSize: '14px',
          fontWeight: '600',
          marginBottom: '12px',
          color: 'var(--docs-text, #111827)',
        }}
      >
        {title}
      </div>
      {items.map((item) => (
        <a
          href={item.href}
          style={{
            display: 'block',
            fontSize: '14px',
            textDecoration: 'none',
            color: 'var(--docs-muted, #6b7280)',
            marginBottom: '8px',
          }}
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}

function SocialLink({ name, href }: { name: string; href: string }) {
  return (
    <a
      href={href}
      data-social
      style={{
        fontSize: '14px',
        textDecoration: 'none',
        color: 'var(--docs-muted, #6b7280)',
      }}
    >
      {name}
    </a>
  );
}

export function Footer({ links, socials }: FooterProps) {
  const socialEntries = socials ? Object.entries(socials) : [];

  return (
    <footer
      style={{
        borderTop: '1px solid var(--docs-border, #e5e7eb)',
        padding: '48px 24px',
        marginTop: '64px',
      }}
    >
      {links && links.length > 0 && (
        <div style={{ display: 'flex', gap: '48px', marginBottom: '32px' }}>
          {links.map((group) => (
            <FooterGroupComponent title={group.title} items={group.items} />
          ))}
        </div>
      )}
      {socialEntries.length > 0 && (
        <div style={{ display: 'flex', gap: '16px' }}>
          {socialEntries.map((entry) => (
            <SocialLink name={entry[0]} href={entry[1]} />
          ))}
        </div>
      )}
    </footer>
  );
}
