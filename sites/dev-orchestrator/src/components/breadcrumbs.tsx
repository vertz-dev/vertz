import { useRouter } from '@vertz/ui/router';
import type { BreadcrumbSegment } from './breadcrumbs-utils';
import { buildBreadcrumbs } from './breadcrumbs-utils';

const s = {
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '13px',
    color: 'var(--color-muted-foreground)',
  },
  link: {
    color: 'var(--color-muted-foreground)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    fontSize: '13px',
    padding: '0',
    textDecoration: 'none',
  },
  current: {
    color: 'var(--color-foreground)',
    fontSize: '13px',
    fontWeight: '500' as const,
  },
  separator: {
    color: 'var(--color-muted-foreground)',
    fontSize: '12px',
    userSelect: 'none' as const,
  },
};

export function Breadcrumbs({ pathname }: { pathname: string }) {
  const { navigate } = useRouter();
  const segments = buildBreadcrumbs(pathname);

  return (
    <nav style={s.nav} aria-label="Breadcrumb">
      {segments.map((seg: BreadcrumbSegment, i: number) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={seg.href}>
            {i > 0 && <span style={s.separator}> / </span>}
            {isLast
              ? <span style={s.current}>{seg.label}</span>
              : <button style={s.link} onClick={() => navigate({ to: seg.href })}>{seg.label}</button>
            }
          </span>
        );
      })}
    </nav>
  );
}
