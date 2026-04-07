import { useRouter } from '@vertz/ui/router';
import { Breadcrumbs } from './breadcrumbs';

const topbarStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: '52px',
  padding: '0 24px',
  borderBottom: '1px solid var(--color-border)',
  background: 'var(--color-card)',
};

const badgeStyle = {
  fontSize: '11px',
  padding: '2px 8px',
  borderRadius: '9999px',
  background: 'var(--color-secondary)',
  color: 'var(--color-secondary-foreground)',
};

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
    <header style={topbarStyle}>
      <Breadcrumbs pathname={pathname} />
      <span style={badgeStyle}>Local</span>
    </header>
  );
}
