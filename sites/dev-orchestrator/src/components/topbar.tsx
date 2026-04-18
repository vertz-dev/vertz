import { css, token } from '@vertz/ui';
import { useRouter } from '@vertz/ui/router';
import { Breadcrumbs } from './breadcrumbs';

const s = css({
  topbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingInline: token.spacing[6],
    borderBottomWidth: '1px',
    borderColor: token.color.border,
    backgroundColor: token.color.card,
    '&': { height: '52px' },
  },
  badge: {
    borderRadius: token.radius.full,
    backgroundColor: token.color.secondary,
    color: token.color['secondary-foreground'],
    '&': { fontSize: '11px', padding: '2px 8px' },
  },
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
