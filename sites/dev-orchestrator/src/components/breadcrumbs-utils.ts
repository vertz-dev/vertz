export interface BreadcrumbSegment {
  label: string;
  href: string;
}

export function buildBreadcrumbs(pathname: string): BreadcrumbSegment[] {
  const segments: BreadcrumbSegment[] = [{ label: 'Dashboard', href: '/' }];

  if (pathname === '/') return segments;

  const parts = pathname.split('/').filter(Boolean);

  if (parts[0] === 'workflows' && parts[1]) {
    segments.push({ label: `Workflow ${parts[1]}`, href: `/workflows/${parts[1]}` });
    if (parts[2] === 'steps' && parts[3]) {
      segments.push({ label: `Step: ${parts[3]}`, href: `/workflows/${parts[1]}/steps/${parts[3]}` });
    }
  } else if (parts[0] === 'definitions') {
    segments.push({ label: 'Definitions', href: '/definitions' });
    if (parts[1]) {
      segments.push({ label: parts[1], href: `/definitions/${parts[1]}` });
    }
  } else if (parts[0] === 'agents') {
    segments.push({ label: 'Agents', href: '/agents' });
    if (parts[1]) {
      segments.push({ label: parts[1], href: `/agents/${parts[1]}` });
    }
  }

  return segments;
}
