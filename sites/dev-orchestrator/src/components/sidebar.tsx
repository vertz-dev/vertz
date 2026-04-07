import { BotIcon, LayoutDashboardIcon, NetworkIcon } from "@vertz/icons";
import { useRouter } from '@vertz/ui/router';

const s = {
  sidebar: {
    width: '220px',
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: '100vh',
    background: 'var(--color-card)',
    borderRight: '1px solid var(--color-border)',
  },
  brand: {
    padding: '16px',
    fontSize: '14px',
    fontWeight: '700' as const,
    color: 'var(--color-foreground)',
  },
  separator: { height: '1px', background: 'var(--color-border)', margin: '0 16px' },
  nav: { display: 'flex', flexDirection: 'column' as const, gap: '2px', padding: '12px' },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    color: 'var(--color-muted-foreground)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    width: '100%',
  },
  navItemActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    color: 'var(--color-foreground)',
    background: 'var(--color-secondary)',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '500' as const,
    textAlign: 'left' as const,
    width: '100%',
  },
  footer: { marginTop: 'auto', padding: '16px', fontSize: '11px', color: 'var(--color-muted-foreground)' },
  kbd: {
    fontSize: '10px',
    padding: '1px 4px',
    borderRadius: '3px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-background)',
    color: 'var(--color-muted-foreground)',
    marginLeft: 'auto',
  },
};

interface NavEntry {
  label: string;
  href: string;
  icon: () => HTMLSpanElement;
  match: (path: string) => boolean;
}

const NAV_ITEMS: NavEntry[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboardIcon, match: (p) => p === '/' },
  { label: 'Definitions', href: '/definitions', icon: NetworkIcon, match: (p) => p.startsWith('/definitions') },
  { label: 'Agents', href: '/agents', icon: BotIcon, match: (p) => p.startsWith('/agents') },
];

function currentPath(router: ReturnType<typeof useRouter>): string {
  const match = router.current;
  if (!match) return '/';
  return match.route.pattern.replace(/:(\w+)/g, (_, key) => match.params[key] ?? '');
}

export function Sidebar() {
  const router = useRouter();
  const path = currentPath(router);

  return (
    <aside style={s.sidebar}>
      <div style={s.brand}>Dev Orchestrator</div>
      <div style={s.separator} />
      <nav style={s.nav}>
        {NAV_ITEMS.map((item) => {
          const active = item.match(path);
          return (
            <button
              key={item.href}
              style={active ? s.navItemActive : s.navItem}
              onClick={() => router.navigate({ to: item.href })}
            >
              {item.icon()}
              {item.label}
            </button>
          );
        })}
      </nav>
      <div style={s.footer}>
        <span style={s.kbd}>Cmd+K</span> to search
      </div>
    </aside>
  );
}
