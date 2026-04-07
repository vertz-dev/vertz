import { css } from '@vertz/ui';
import { useRouter } from '@vertz/ui/router';
import { Breadcrumbs } from './breadcrumbs';

const s = css({
  topbar: [
    'flex', 'items:center', 'justify:between', 'px:6', 'border-b:1', 'border:border', 'bg:card',
    { '&': { height: '52px' } },
  ],
  badge: [
    'rounded:full', 'bg:secondary', 'text:secondary-foreground',
    { '&': { 'font-size': '11px', padding: '2px 8px' } },
  ],
});

function currentPathname(router: ReturnType<typeof useRouter>): string {
  const match = router.current;
  if (!match) return '/';
  const pattern = match.route.pattern;
  const params = match.params;
  return pattern.replace(/:(\w+)/g, (_, key) => params[key] ?? '');
}

export function Topbar() {
  const router = useRouter();
  const pathname = currentPathname(router);

  return (
    <header className={s.topbar}>
      <Breadcrumbs pathname={pathname} />
      <span className={s.badge}>Local</span>
    </header>
  );
}
