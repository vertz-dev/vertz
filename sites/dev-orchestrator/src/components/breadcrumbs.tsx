import { css } from '@vertz/ui';
import { useRouter } from '@vertz/ui/router';
import type { BreadcrumbSegment } from './breadcrumbs-utils';
import { buildBreadcrumbs } from './breadcrumbs-utils';

const s = css({
  nav: ['flex', 'items:center', 'gap:1', 'text:sm', 'text:muted-foreground'],
  link: [
    'text:muted-foreground', 'text:sm', 'cursor:pointer',
    { '&': { background: 'none', border: 'none', padding: '0', 'text-decoration': 'none' } },
  ],
  current: ['text:foreground', 'text:sm', 'font:medium'],
  separator: ['text:muted-foreground', 'text:xs', 'select-none'],
});

export function Breadcrumbs({ pathname }: { pathname: string }) {
  const { navigate } = useRouter();
  const segments = buildBreadcrumbs(pathname);

  return (
    <nav className={s.nav} aria-label="Breadcrumb">
      {segments.map((seg: BreadcrumbSegment, i: number) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={seg.href}>
            {i > 0 && <span className={s.separator}> / </span>}
            {isLast
              ? <span className={s.current}>{seg.label}</span>
              : <button className={s.link} onClick={() => navigate({ to: seg.href })}>{seg.label}</button>
            }
          </span>
        );
      })}
    </nav>
  );
}
