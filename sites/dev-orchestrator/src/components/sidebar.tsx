import { BotIcon, LayoutDashboardIcon, NetworkIcon } from "@vertz/icons";
import { css } from '@vertz/ui';
import { useRouter } from '@vertz/ui/router';

const s = css({
  sidebar: ['flex', 'flex-col', 'min-h:screen', 'bg:card', 'border-r:1', 'border:border', { '&': { width: '220px' } }],
  brand: ['p:4', 'text:sm', 'font:bold', 'text:foreground'],
  separator: ['bg:border', 'mx:4', { '&': { height: '1px' } }],
  nav: ['flex', 'flex-col', 'p:3', { '&': { gap: '2px' } }],
  navItem: [
    'flex', 'items:center', 'gap:2', 'px:3', 'py:2', 'rounded:md', 'text:sm',
    'text:muted-foreground', 'w:full', 'cursor:pointer', 'text:left',
    { '&': { background: 'transparent', border: 'none' } },
  ],
  navItemActive: [
    'flex', 'items:center', 'gap:2', 'px:3', 'py:2', 'rounded:md', 'text:sm',
    'text:foreground', 'bg:secondary', 'font:medium', 'w:full', 'cursor:pointer', 'text:left',
    { '&': { border: 'none' } },
  ],
  footer: ['p:4', 'text:muted-foreground', { '&': { 'margin-top': 'auto', 'font-size': '11px' } }],
  kbd: [
    'bg:background', 'text:muted-foreground', 'border:1', 'border:border',
    { '&': { 'font-size': '10px', padding: '1px 4px', 'border-radius': '3px', 'margin-left': 'auto' } },
  ],
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
