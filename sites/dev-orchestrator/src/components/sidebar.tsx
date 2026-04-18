import { BotIcon, LayoutDashboardIcon, NetworkIcon } from '@vertz/icons';
import { css, token } from '@vertz/ui';
import { useRouter } from '@vertz/ui/router';

const s = css({
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: token.color.card,
    borderRightWidth: '1px',
    borderColor: token.color.border,
    '&': { width: '220px' },
  },
  brand: {
    padding: token.spacing[4],
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.bold,
    color: token.color.foreground,
  },
  separator: {
    backgroundColor: token.color.border,
    marginInline: token.spacing[4],
    '&': { height: '1px' },
  },
  nav: { display: 'flex', flexDirection: 'column', padding: token.spacing[3], '&': { gap: '2px' } },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[2],
    paddingInline: token.spacing[3],
    paddingBlock: token.spacing[2],
    borderRadius: token.radius.md,
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    width: '100%',
    cursor: 'pointer',
    textAlign: 'left',
    '&': { background: 'transparent', border: 'none' },
  },
  navItemActive: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[2],
    paddingInline: token.spacing[3],
    paddingBlock: token.spacing[2],
    borderRadius: token.radius.md,
    fontSize: token.font.size.sm,
    color: token.color.foreground,
    backgroundColor: token.color.secondary,
    fontWeight: token.font.weight.medium,
    width: '100%',
    cursor: 'pointer',
    textAlign: 'left',
    '&': { border: 'none' },
  },
  footer: {
    padding: token.spacing[4],
    color: token.color['muted-foreground'],
    '&': { marginTop: 'auto', fontSize: '11px' },
  },
  kbd: {
    backgroundColor: token.color.background,
    color: token.color['muted-foreground'],
    borderWidth: '1px',
    borderColor: token.color.border,
    '&': { fontSize: '10px', padding: '1px 4px', borderRadius: '3px', marginLeft: 'auto' },
  },
});

interface NavEntry {
  label: string;
  href: string;
  match: (path: string) => boolean;
}

const NAV_ITEMS: NavEntry[] = [
  { label: 'Dashboard', href: '/', match: (p) => p === '/' },
  { label: 'Definitions', href: '/definitions', match: (p) => p.startsWith('/definitions') },
  { label: 'Agents', href: '/agents', match: (p) => p.startsWith('/agents') },
];

function NavIcon({ href }: { href: string }) {
  if (href === '/') return <LayoutDashboardIcon />;
  if (href === '/definitions') return <NetworkIcon />;
  return <BotIcon />;
}

function currentPath(router: ReturnType<typeof useRouter>): string {
  const match = router.current;
  if (!match) return '/';
  return match.route.pattern.replace(/:(\w+)/g, (_, key) => match.params[key] ?? '');
}

export function Sidebar() {
  const router = useRouter();
  const path = currentPath(router);

  return (
    <aside className={s.sidebar}>
      <div className={s.brand}>Dev Orchestrator</div>
      <div className={s.separator} />
      <nav className={s.nav}>
        {NAV_ITEMS.map((item) => {
          const active = item.match(path);
          return (
            <button
              key={item.href}
              className={active ? s.navItemActive : s.navItem}
              onClick={() => router.navigate({ to: item.href })}
            >
              <NavIcon href={item.href} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className={s.footer}>
        <span className={s.kbd}>Cmd+K</span> to search
      </div>
    </aside>
  );
}
